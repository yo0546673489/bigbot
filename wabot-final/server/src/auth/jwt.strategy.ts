import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // Custom extractor to check both header and cookie
    const cookieExtractor = (req: Request): string | null => {
      let token = null;
      if (req && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      }
      if (!token && req && req.cookies && req.cookies['auth_token']) {
        token = req.cookies['auth_token'];
      }
      return token;
    };
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key', // In production, use environment variable
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, email: payload.email };
  }
} 