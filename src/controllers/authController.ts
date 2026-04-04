import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../database';
import { UsuarioRepository } from '../repositories/usuarioRepository';
import { logError, logWarn } from '../utils/logger';

const secret = process.env.JWT_SECRET || 'default_secret';

export class AuthController {
  async register(req: Request, res: Response) {
    const { username, senha, nome, email } = req.body;

    if (!username || !senha || !nome || !email) {
      return res.status(400).json({ message: 'Todos os campos (username, senha, nome, email) são obrigatórios.' });
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ message: 'Email inválido.' });
    }

    if (typeof senha !== 'string' || senha.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const existingUser = await prisma.usuario.findFirst({
      where: {
        OR: [
          { username: username },
          { email: email }
        ]
      }
    });

    if (existingUser) {
      logWarn('User registration failed: username or email already exists', { email, username });
      return res.status(409).json({ message: 'Usuário ou email já cadastrado.' });
    }

    try {
      const hashedPassword = await bcrypt.hash(senha, 10);
      const user = await prisma.usuario.create({
        data: { username, senha: hashedPassword, nome, email },
      });

      res.status(201).json(user);
    } catch (error) {
      logError('Failed to register user', error, { email, username });
      res.status(500).json({ message: 'Error registering user', error });
    }
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const userRepository = new UsuarioRepository();

    try {
      const user = await userRepository.findByEmail(email);

      if (!user) {
        logWarn('Login failed: user not found', { email });
        return res.status(401).json({ message: 'Invalid credentials' });
      }
     
      const correctPass = await bcrypt.compare(password, user.senha);

      if (correctPass) {
        const token = jwt.sign({ 
          id: user.id, 
          email: user.email,
          tenantId: user.id_tenant 
        }, secret, {
          expiresIn: "2d",
        });
        return res.json({ token, user });
      }

      logWarn('Login failed: invalid password', { email });
      return res.status(401).json({message: 'Senha ou email incorreto'});
     
    } catch (error: any) {
      logError('Failed to login', error, { email });
      res.status(500).json({ message: 'Error logging in', error : error.message });
    }
  }
}
