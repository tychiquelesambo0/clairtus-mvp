export function generateSecure4DigitPin(): string {
  const modulus = 10_000;
  const maxUint32 = 0xffff_ffff;
  const maxUnbiased = Math.floor((maxUint32 + 1) / modulus) * modulus - 1;

  const sample = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(sample);
    value = sample[0];
  } while (value > maxUnbiased);

  const pinNumber = value % modulus;
  return pinNumber.toString().padStart(4, "0");
}

export function isValid4DigitPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

export function constantTimePinEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}
