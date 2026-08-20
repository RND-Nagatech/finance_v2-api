import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import User from '../models/User';
import { fromBase64URL, toBase64URL } from '../utils/webauthnBackend';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const rpID = 'localhost';
const rpName = 'Akunting App';
const origin = 'http://localhost:8080';

/* ===== Normal register ===== */
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email & password diperlukan' });

    const exists = await User.findOne({ username: email });
    if (exists) return res.status(400).json({ message: 'User sudah ada' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username: email, password: hashed, name, credentials: [] });
    return res.json({ success: true, message: 'Registrasi berhasil', userId: user._id });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', err });
  }
};

/* ===== Normal login ===== */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ username: email });
    if (!user) return res.status(401).json({ message: 'Email atau password salah' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Email atau password salah' });

    const token = jwt.sign({ id: user._id, username: user.username, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.username, role: user.role } });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', err });
  }
};

/* ===== WebAuthn: generateRegisterChallenge ===== */
export const generateRegisterChallenge = async (req: Request, res: Response) => {
  try {
    const { username, password, name } = req.body;
    let user = await User.findOne({ username });
    if (!user) {
      const hashed = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('temp', 10);
      user = await User.create({ username, password: hashed, name, credentials: [] });
    }

    const userID = Buffer.from(user._id.toString(), 'utf8');
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID,
      userName: user.username,
      attestationType: 'none',
      authenticatorSelection: { userVerification: 'preferred' },
      excludeCredentials: user.credentials.map((cred: any) => ({ id: cred.credentialID })),
    });

    user.currentChallenge = options.challenge;
    await user.save();
    return res.json(options);
  } catch (err) {
    return res.status(500).json({ error: 'Gagal generate challenge', detail: err });
  }
};

/* ===== WebAuthn: verifyRegisterResponse ===== */
export const verifyRegisterResponse = async (req: Request, res: Response) => {
  try {
    const { credential, username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: user.currentChallenge!,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verifikasi pendaftaran gagal' });
    }

    const regCred = verification.registrationInfo.credential;
    user.credentials.push({
      credentialID: regCred.id,
      publicKey: toBase64URL(regCred.publicKey), // simpan string
      counter: regCred.counter,
    });

    await user.save();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal verifikasi register', detail: err });
  }
};

/* ===== WebAuthn: generateLoginChallenge ===== */
export const generateLoginChallenge = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.credentials.length === 0) return res.status(404).json({ error: 'Credential tidak ada' });

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: user.credentials.map((cred: any) => ({ id: cred.credentialID })),
    });

    user.currentChallenge = options.challenge;
    await user.save();
    return res.json(options);
  } catch (err) {
    return res.status(500).json({ error: 'Gagal generate challenge', detail: err });
  }
};

/* ===== WebAuthn: verifyLoginResponse ===== */
export const verifyLoginResponse = async (req: Request, res: Response) => {
  try {
    const { credential, username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    const rawId = credential.id || credential.rawId;
    const authenticator = user.credentials.find((c: any) => c.credentialID === rawId);
    if (!authenticator) return res.status(404).json({ error: 'Credential tidak ditemukan' });

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: user.currentChallenge!,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: new Uint8Array(fromBase64URL(authenticator.publicKey)), // convert ke Uint8Array
        counter: authenticator.counter,
      },
    });

    if (!verification.verified) return res.status(400).json({ error: 'Verifikasi login gagal' });

    authenticator.counter = verification.authenticationInfo?.newCounter ?? authenticator.counter;
    await user.save();

    // Kirim data user agar frontend bisa simpan nama user
    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.username,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal verifikasi login', detail: err });
  }
};

/* ===== Get all users ===== */
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, '-password -credentials -currentChallenge');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

/* ===== Update user ===== */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body;
    const user = await User.findByIdAndUpdate(id, { name, role }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

/* ===== Delete user ===== */
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};
