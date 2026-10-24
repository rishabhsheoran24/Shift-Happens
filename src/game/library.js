// Works with Vite. BASE_URL is "/" locally and your repo path (e.g. "/my-repo/") on GitHub Pages.
const BASE = import.meta.env.BASE_URL

const photo = (id, title, file) => ({
  id,
  title,
  type: 'photo',
  url: `${BASE}library/${file}`,
  uploadedBy: 'library',
})

const gif = (id, title, file) => ({
  id,
  title,
  type: 'gif',
  url: `${BASE}library/${file}`,
  uploadedBy: 'library',
})

const audio = (id, title, file) => ({
  id,
  title,
  type: 'audio',
  url: `${BASE}library/${file}`,
  uploadedBy: 'library',
})

const video = (id, title, file) => ({
  id,
  title,
  type: 'video',
  url: `${BASE}library/${file}`,
  uploadedBy: 'library',
})

const shield = (id, title, effect) => ({
  id,
  title,
  type: 'shield',
  effect,
  uploadedBy: 'library',
})

export const LIBRARY = [
  // Photos (memes)
  photo('p1', 'Mujhe Ghar Jaana Hai', 'meme1.jpeg'),
  photo('p2', 'Zindagi Badal Di', 'meme2.jpeg'),
  photo('p3', 'Munh Dho Kar Aa', 'meme3.jpeg'),
  photo('p4', 'Hamare Yaha Aisa Hi Hota Hai', 'meme4.jpeg'),
  photo('p5', 'Ashleel Hai Ye Launda', 'meme5.jpeg'),
  photo('p6', 'Koi Apse Pyar Kyu Krega', 'meme6.jpeg'),
  photo('p7', 'Hey Maa, Mata-Ji', 'meme7.jpeg'),
  photo('p8', 'Kuch Bhi', 'meme8.jpeg'),
  photo('p9', 'Yeh Sab Doglapan Hai', 'meme9.jpeg'),
  photo('p10', 'Ricks Ni Lene Ka', 'meme10.jpeg'),
  photo('p11', 'Mast Joke Mara Re', 'meme11.jpeg'),
  photo('p12', 'Khopdi Tor Sale Ka', 'meme12.jpeg'),
  photo('p13', 'Ye Bhi Meri Galti Hai', 'meme13.jpeg'),
  photo('p14', 'Goli Beta Masti Nai', 'meme14.jpeg'),
  photo('p15', 'Confused Look', 'meme15.jpeg'),
  photo('p16', 'Biltul Tup', 'meme16.jpeg'),
  photo('p17', 'Heart Touching', 'meme17.jpeg'),
  photo('p18', 'Bahut Gambhir Samasya', 'meme18.jpeg'),
  photo('p19', 'Mast Plan Hai', 'meme19.jpeg'),
  photo('p20', 'Kya Gunda Banega Re Tu', 'meme20.jpeg'),
  photo('p21', 'Nonsense', 'meme21.jpeg'),
  photo('p22', 'Very Esmart', 'meme22.jpeg'),
  photo('p23', 'Oho Bade Logggg', 'meme23.jpeg'),
  photo('p24', 'Kuch To Sharam Karo Janab', 'meme24.jpeg'),
  photo('p25', 'Chal Nikal', 'meme25.jpeg'),
  photo('p26', 'Dil Se Bura Lagta Hai', 'meme26.jpeg'),
  photo('p27', 'Karwaali Bejjati', 'meme27.jpeg'),
  photo('p28', 'Hands On Head', 'meme28.jpeg'),
  photo('p29', 'Miracle! Miracle!', 'meme29.jpeg'),
  photo('p30', 'Mere Charnno Mein Aapka Parnaam', 'meme30.jpeg'),
  photo('p31', 'Baat Hi Karna Chhod De', 'meme31.jpeg'),
  photo('p32', 'Baate Dekho Enki', 'meme32.jpeg'),
  photo('p33', 'Ae Hoshiyari', 'meme33.jpeg'),

  // GIFs
  gif('g1', 'Cat Sigma', 'cat-sigma.gif'),
  gif('g2', 'Dance Dancing', 'dance-dancing.gif'),
  gif('g3', 'Funny Cat', 'funny-cat.gif'),

  // Videos
  video('v1', 'Weird_faces', 'weird_faces.mp4'),
  video('v2', 'Laugh', 'meme_02.mp4'),
  video('v3', 'Pyaari Samajh Gayi', 'meme_03.mp4'),
  video('v4', 'Abhi Maza Ayega Na Bhidu', 'meme_04.mp4'),
  video('v5', 'Salman Khan Laughing', 'meme_05.mp4'),
  video('v6', 'Raha Nai Jaata Tadap Hi Esi Hai', 'meme_06.mp4'),
  video('v7', 'Laughing Full', 'meme_07.mp4'),
  video('v8', 'Noob', 'meme_08.mp4'),
  video('v9', 'Apun hi bhagwan hai', 'meme_09.mp4'),
  video('v10', 'Beta Tumse Na Ho Payega', 'meme_10.mp4'),
  video('v11', '50 Rupe kat overacting ka', 'meme_11.mp4'),
  video('v12', 'Maut ko chu ke', 'meme_12.mp4'),
  video('v13', 'Arey maiya ye kya dekh liya', 'meme_13.mp4'),
  video('v14', 'Baap ko mat sikha', 'meme_14.mp4'),
  video('v15', 'Jhooth Bol rha hai', 'meme_15.mp4'),
  video('v16', 'Utha Le re baba', 'meme_16.mp4'),
  video('v17', 'Cheating krta hai tu', 'meme_17.mp4'),
  video('v18', 'Jaldi bol panvel nikalna hai', 'meme_18.mp4'),
  video('v19', 'Ye koi tareeka hai bheekh maangne ka', 'meme_19.mp4'),
  video('v20', 'Accha hamko sikha riya hai', 'meme_20.mp4'),

  // Audio
  {
    id: 'a1',
    title: 'T-Rex Roar',
    type: 'audio',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    uploadedBy: 'library',
  },
  audio('a2', 'Shooting sound', 'audio-1.mp3'),
  audio('a3', 'Crickets sound', 'audio-2.mp3'),
  audio('a4', 'Thumping music', 'audio-3.mp3'),

  // Shields
  shield('s1', 'Sunglasses', 'block'),
  shield('s2', 'Umbrella', 'halve'),
]
