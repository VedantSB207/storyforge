export const C = {
  bg: '#09090c', bgCard: '#111116', bgDeep: '#0d0d11', bgElevated: '#161620',
  border: '#1c1c24', borderMid: '#2a2a36', borderAcc: '#3a1212',
  acc: '#8b1f1f', accBright: '#c0392b',
  gold: '#c9a857', purple: '#7b5fc4', purpleLight: '#a685e8',
  parch: '#ddd5bb', muted: '#5a5450', mutedLight: '#8a8278',
  green: '#2d8a4e', teal: '#1a8a7a', blue: '#3a6fa0', tagBg: '#161620',
  node: { character:'#c0392b', event:'#c9a857', location:'#2d8a4e', artifact:'#7b5fc4', theme:'#1a8a7a', chapter:'#3a6fa0', note:'#5a5450' }
};

export const genId = () => Math.random().toString(36).slice(2,8);
