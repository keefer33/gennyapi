import jwt from 'jsonwebtoken';

type KlingJwtPayload = {
  iss: string;
  exp: number;
  nbf: number;
};

export const klingCreateJWT = (accessKey: string, secretKey: string): string => {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const payload: KlingJwtPayload = {
    iss: accessKey,
    exp: nowSeconds + 1800,
    nbf: nowSeconds - 5,
  };

  return jwt.sign(payload, secretKey, {
    algorithm: 'HS256',
  });
};