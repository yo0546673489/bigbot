import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private jwtService: JwtService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const { email, password } = body;
    
    // Check for admin credentials
    if (email === 'admin@drybot.com' && password === 'password123') {
      const payload = { 
        sub: 1, 
        email: email,
        role: 'admin'
      };
      
      return {
        user: {
          id: 1,
          email: email,
          name: 'Admin User',
          role: 'admin'
        },
        token: this.jwtService.sign(payload, {
          expiresIn: '2d'
        })
      };
    }
    
    throw new UnauthorizedException('Invalid credentials');
  }
} 