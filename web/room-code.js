export function randomRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 100).padStart(2, "0");
}

export function cleanRoom(value) {
  return String(value).replace(/\D/g, "").slice(0, 2);
}
