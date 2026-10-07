import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let appFactory;
let userRepository;
let albumRepository;
let hashPassword;
let tempDir;
let app;
let db;

async function setupApp() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-platform-test-'));
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.DATABASE_URL = path.join(tempDir, 'test.sqlite');
  process.env.PICTURES_DIR = path.join(tempDir, 'Pictures');
  process.env.FRONTEND_URL = 'http://localhost:5173';

  vi.resetModules();

  ({ createApp: appFactory } = require('../src/app'));
  userRepository = require('../src/repositories/userRepository');
  albumRepository = require('../src/repositories/albumRepository');
  ({ hashPassword } = require('../src/utils/password'));
  db = require('../src/config/db');

  return appFactory();
}

async function createAuthenticatedUser(server, permissions = []) {
  const hashed = await hashPassword('Password123!');
  const user = await userRepository.createUser({
    name: 'User',
    email: `user-${Date.now()}@example.com`,
    passwordHash: hashed,
    role: 'user',
    status: 'active',
  });
  await userRepository.setPermissions(user.id, permissions);

  const agent = request.agent(server);
  await agent.post('/api/auth/login').send({ email: user.email, password: 'Password123!' });
  return { user, agent };
}

beforeAll(async () => {
  app = await setupApp();
});

beforeEach(async () => {
  for (const table of ['album_access', 'photos', 'albums', 'user_permissions', 'users', 'audit_logs']) {
    await db.query(`DELETE FROM ${table}`);
  }
});

describe('auth', () => {
  it('rejects bad password on login', async () => {
    const hash = await hashPassword('Password123!');
    await userRepository.createUser({
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: hash,
      role: 'main_admin',
      status: 'active',
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'wrong-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('INVALID_CREDENTIALS');
  });
});

describe('permissions and protected access', () => {
  it('blocks album creation without CREATE_ALBUMS', async () => {
    const { agent } = await createAuthenticatedUser(app, []);

    const response = await agent.post('/api/albums').send({ name: 'Album test', visibility: 'public' });

    expect(response.status).toBe(403);
  });

  it('blocks protected album photo listing without access', async () => {
    const ownerHash = await hashPassword('Password123!');
    const owner = await userRepository.createUser({
      name: 'Owner',
      email: 'owner@example.com',
      passwordHash: ownerHash,
      role: 'user',
      status: 'active',
    });
    const visitorHash = await hashPassword('Password123!');
    const visitor = await userRepository.createUser({
      name: 'Visitor',
      email: 'visitor@example.com',
      passwordHash: visitorHash,
      role: 'user',
      status: 'active',
    });

    await userRepository.setPermissions(owner.id, ['CREATE_ALBUMS', 'UPLOAD_PHOTOS']);
    const protectedAlbum = await albumRepository.createAlbum({
      name: 'Privé',
      description: '',
      visibility: 'protected',
      passwordHash: null,
    });
    await albumRepository.setAlbumAccess(protectedAlbum.id, [owner.id]);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: visitor.email, password: 'Password123!' });

    const response = await agent.get(`/api/albums/${protectedAlbum.id}/photos`);
    expect(response.status).toBe(403);
  });
});

describe('upload validation', () => {
  it('rejects non-jpeg files and files over 1MB', async () => {
    const { user, agent } = await createAuthenticatedUser(app, ['CREATE_ALBUMS', 'UPLOAD_PHOTOS']);
    const album = await albumRepository.createAlbum({ name: 'A', description: '', visibility: 'public', passwordHash: null });
    await albumRepository.setAlbumAccess(album.id, [user.id]);

    const pngBuffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();

    const invalidResponse = await agent
      .post(`/api/albums/${album.id}/photos`)
      .attach('photos', pngBuffer, { filename: 'image.png', contentType: 'image/png' });
    expect(invalidResponse.status).toBe(400);

    const huge = Buffer.alloc(1024 * 1024 + 1, 0xff);
    const hugeResponse = await agent
      .post(`/api/albums/${album.id}/photos`)
      .attach('photos', huge, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(hugeResponse.status).toBe(413);
  });
});
