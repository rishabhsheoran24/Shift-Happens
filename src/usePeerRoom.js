import { useCallback, useEffect, useRef, useState } from "react";
import Peer from "peerjs";

const PREFIX = "pfa-"; // keeps our room ids unique on the free PeerJS server
const TURN_URL = import.meta.env.VITE_TURN_URL;
const PEER_OPTIONS = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      ...(TURN_URL
        ? [
            {
              urls: TURN_URL.split(",").map((u) => u.trim()),
              username: import.meta.env.VITE_TURN_USER,
              credential: import.meta.env.VITE_TURN_PASS,
            },
          ]
        : []),
    ],
  },
};
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing O/0, I/1
const makeCode = () =>
  Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

/**
 * usePeerRoom
 * Handles room codes, the live video call and the data channel for two players.
 *
 * Options:
 *   localStream - this player's camera stream (from useLocalCamera)
 *   onMessage   - callback(data) called when the opponent sends something
 *
 * Returns:
 *   status       - "idle" | "waiting" | "connecting" | "connected" | "disconnected" | "error"
 *   roomCode     - the 4-letter code (set as soon as createRoom is called)
 *   remoteStream - the opponent's video stream (null until connected)
 *   error        - error message or null
 *   createRoom() - Player 1: makes a room and waits
 *   joinRoom(code) - Player 2: joins a room by code
 *   send(obj)    - send any object to the opponent
 *   leave()      - close everything and reset
 */
export function usePeerRoom({ localStream, onMessage } = {}) {
  const [status, setStatus] = useState("idle");
  const [roomCode, setRoomCode] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [error, setError] = useState(null);

  const aliveRef = useRef(true);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const callRef = useRef(null);

  // Keep the latest stream and callback in refs so the PeerJS handlers never go stale.
  const streamRef = useRef(localStream);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    streamRef.current = localStream;
    onMessageRef.current = onMessage;
  });

  const safe = (fn) => {
    if (aliveRef.current) fn();
  };

  const leave = useCallback(() => {
    connRef.current?.close();
    callRef.current?.close();
    peerRef.current?.destroy();
    connRef.current = null;
    callRef.current = null;
    peerRef.current = null;
    safe(() => {
      setRemoteStream(null);
      setRoomCode(null);
      setStatus("idle");
    });
  }, []);

  // Listen for data messages and connection state on a data connection.
  const setupConn = useCallback((c) => {
    connRef.current = c;
    c.on("open", () => safe(() => setStatus("connected")));
    c.on("data", (d) => onMessageRef.current?.(d));
    c.on("close", () => safe(() => setStatus("disconnected")));
  }, []);

  const handleCall = useCallback((call) => {
    callRef.current = call;
    call.on("stream", (s) => safe(() => setRemoteStream(s)));
    call.on("close", () => safe(() => setRemoteStream(null)));
  }, []);

  // Player 1
  const createRoom = useCallback(
    (attempt = 0) => {
      if (!streamRef.current) {
        setError("Start your camera first.");
        setStatus("error");
        return;
      }
      leave();
      setError(null);

      const code = makeCode();
      setRoomCode(code); // show the code right away, don't wait for the server
      const peer = new Peer(PREFIX + code, PEER_OPTIONS);
      peerRef.current = peer;

      peer.on("open", () =>
        safe(() => {
          setRoomCode(code);
          setStatus("waiting");
        })
      );

      peer.on("error", (e) => {
        if (e.type === "unavailable-id" && attempt < 5) {
          createRoom(attempt + 1); // code already taken, try another
        } else {
          safe(() => {
            setError(e.type);
            setStatus("error");
          });
        }
      });

      // Player 2 calls us: answer with our camera, show theirs.
      peer.on("call", (call) => {
        call.answer(streamRef.current);
        handleCall(call);
      });

      // Player 2 opens the data channel.
      peer.on("connection", setupConn);

      return code;
    },
    [leave, handleCall, setupConn]
  );

  // Player 2
  const joinRoom = useCallback(
    (rawCode) => {
      const code = rawCode.trim().toUpperCase();
      if (!streamRef.current) {
        setError("Start your camera first.");
        setStatus("error");
        return;
      }
      if (code.length !== 4) {
        setError("Enter the 4-character code.");
        setStatus("error");
        return;
      }
      leave();
      setError(null);
      setStatus("connecting");

      const peer = new Peer(undefined, PEER_OPTIONS);
      peerRef.current = peer;

      peer.on("open", () => {
        handleCall(peer.call(PREFIX + code, streamRef.current));
        setupConn(peer.connect(PREFIX + code));
      });

      peer.on("error", (e) =>
        safe(() => {
          setError(e.type === "peer-unavailable" ? "Room not found. Check the code." : e.type);
          setStatus("error");
        })
      );
    },
    [leave, handleCall, setupConn]
  );

  const send = useCallback((data) => {
    if (connRef.current?.open) connRef.current.send(data);
  }, []);

  // Close everything when the component unmounts.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      connRef.current?.close();
      callRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  return { status, roomCode, remoteStream, error, createRoom, joinRoom, send, leave };
}
