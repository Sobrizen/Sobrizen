/* Pure game rules: no DOM, tracking, billing or network access. */
export const DIRECTIONS = ['left','right','up','down'];
export function slide2048(board, direction) {
  if (!Array.isArray(board) || board.length !== 16 || !DIRECTIONS.includes(direction))
    throw new TypeError('A 4×4 board and a valid direction are required.');
  const result = Array(16).fill(0), merged = [], motion = [];
  let gained = 0;
  for (let lane = 0; lane < 4; lane++) {
    const indices = Array.from({length:4}, (_, n) => direction === 'left' ? lane*4+n : direction === 'right' ? lane*4+3-n : direction === 'up' ? n*4+lane : (3-n)*4+lane);
    const tiles = indices.filter(i => board[i]).map(i => ({value:board[i], from:i}));
    let out = 0;
    for (let n = 0; n < tiles.length; n++) {
      const tile = tiles[n], to = indices[out++];
      let value = tile.value;
      motion.push({from:tile.from, to, value});
      if (tiles[n+1]?.value === value) {
        motion.push({from:tiles[++n].from, to, value});
        value *= 2; gained += value; merged.push(to);
      }
      result[to] = value;
    }
  }
  return {board:result, gained, merged, motion, changed:result.some((v,i)=>v!==board[i])};
}
export function spawn2048(board, random=Math.random, initial=false) {
  const available = board.flatMap((v,i)=>v ? [] : [i]);
  if (!available.length) return {board:[...board], index:-1};
  const index = available[Math.min(available.length-1, Math.max(0, Math.floor(random()*available.length)))];
  const next = [...board]; next[index] = initial || random() < .9 ? 2 : 4;
  return {board:next,index};
}
export function create2048(random=Math.random) {
  return spawn2048(spawn2048(Array(16).fill(0),random,true).board,random,true).board;
}
export function canMove2048(board) {
  return board.includes(0) || board.some((v,i)=>(i%4<3&&v===board[i+1])||(i<12&&v===board[i+4]));
}
export function level2048(board) {
  return Math.max(1, Math.min(10, Math.floor(Math.log2(Math.max(2,...board)))-3));
}
export function sequenceTiming(length) {
  return {on:Math.max(300,820-(length-1)*32),gap:Math.max(150,300-(length-1)*8)};
}
export function extendSequence(sequence,random=Math.random) {
  return [...sequence,Math.min(3,Math.max(0,Math.floor(random()*4)))];
}
