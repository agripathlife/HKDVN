// Pure-JS SHA-256 helper so passcode hashing works reliably in all browser contexts (HTTPS & HTTP)

export function sha256Hex(asciiInput: string): string {
  const utf8 = unescape(encodeURIComponent(asciiInput));
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = utf8.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let padded = utf8 + '\x80';
  while ((padded.length % 64) - 56) padded += '\x00';
  for (let i = 0; i < padded.length; i++) {
    const j = padded.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export function generatePasscodeSalt(): string {
  const arr = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateRandom8DigitPasscode(): string {
  const digits: string[] = [];
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 8; i++) digits.push(String(arr[i] % 10));
  } else {
    for (let i = 0; i < 8; i++) digits.push(String(Math.floor(Math.random() * 10)));
  }
  return digits.join('');
}

export function hashAdminPasscode(passcode: string, salt: string): string {
  return sha256Hex(`hkdvn:${salt}:${passcode.trim()}`);
}

export const SHA256_INLINE_SCRIPT = `function sha256Hex(asciiInput){var utf8=unescape(encodeURIComponent(asciiInput)),rr=function(v,a){return(v>>>a)|(v<<(32-a))},mp=Math.pow,mw=mp(2,32),res='',w=[],bl=utf8.length*8,h=[],k=[],pc=0,ic={};for(var c=2;pc<64;c++){if(!ic[c]){for(var i=0;i<313;i+=c)ic[i]=1;h[pc]=(mp(c,.5)*mw)|0;k[pc++]=(mp(c,1/3)*mw)|0;}}var p=utf8+'\\x80';while((p.length%64)-56)p+='\\x00';for(var i=0;i<p.length;i++)w[i>>2]|=p.charCodeAt(i)<<((3-i)%4)*8;w[w.length]=(bl/mw)|0;w[w.length]=bl;for(var j=0;j<w.length;){var W=w.slice(j,j+=16),oh=h.slice(0);for(var i=0;i<64;i++){var w15=W[i-15],w2=W[i-2],a=h[0],e=h[4],t1=h[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&h[5])^(~e&h[6]))+k[i]+(W[i]=i<16?W[i]:(W[i-16]+(rr(w15,7)^rr(w15,18)^(w15>>>3))+W[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10)))|0),t2=(rr(a,2)^rr(a,13)^rr(a,22))+((a&h[1])^(a&h[2])^(h[1]&h[2]));h.unshift((t1+t2)|0);h[4]=(h[4]+t1)|0;h.pop();}for(var i=0;i<8;i++)h[i]=(h[i]+oh[i])|0;}for(var i=0;i<8;i++)for(var j=3;j+1;j--){var b=(h[i]>>(j*8))&255;res+=(b<16?'0':'')+b.toString(16);}return res;}`;
