// 新竹週末小旅（6/12–13）
module.exports = {
  htmlFile: '../../20260612_13/260612新竹.html',
  region: '新竹',
  county: '新竹市',
  townships: ['東區', '北區', '香山區'],
  unions: [{ name: '新竹市', members: ['東區', '北區', '香山區'] }],
  bridgeBetween: null,
  inland: true,
  epsilon: 0.0011,
  targetW: 52,
  seaColor: 0xD8E6CC,
  islandFill: '#BFD8A0',
  title: '新竹市',
  islandNames: { '新竹市': '新竹市' },
  dayNames: {
    all: '🗺️ 全部路線總覽',
    1: '🟣 D1・週五抵達入住',
    2: '🟢 D2・劇本殺 + 甜點',
  },
  dayCols: { 1: 0x8B6BB1, 2: 0x18A0B0 },
  spots: [
    { n: '週五住宿',       lon: 121.0225, lat: 24.7786, t: 'stay', d: [1] },
    { n: '阿婆早餐麵店',   lon: 120.968,  lat: 24.803,  t: 'food', d: [2] },
    { n: '陽明交大',       lon: 120.997,  lat: 24.787,  t: 'spot', d: [2] },
    { n: '格林小鎮',       lon: 120.972,  lat: 24.800,  t: 'food', d: [2] },
  ],
  routes: {
    1: ['週五住宿'],
    2: ['阿婆早餐麵店', '陽明交大', '格林小鎮'],
  },
};
