import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-platform-test-'));
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = path.join(tempDir, 'test.sqlite');
process.env.PICTURES_DIR = path.join(tempDir, 'Pictures');
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.VERCEL;
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;

const { createApp, initialize } = require('../src/app');
const db = require('../src/config/db');
const userRepository = require('../src/repositories/userRepository');
const albumRepository = require('../src/repositories/albumRepository');
const { hashPassword } = require('../src/utils/password');

const PASSWORD = 'Password123!';
let app;
let passwordHash;
let counter = 0;

async function createUser({ role = 'user', permissions = [] } = {}) {
  counter += 1;
  const user = await userRepository.createUser({
    name: `User ${counter}`,
    email: `user-${counter}@example.com`,
    passwordHash,
    role,
    status: 'active',
  });
  await userRepository.setPermissions(user.id, permissions);
  return user;
}

async function signIn(user) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  expect(response.status).toBe(200);
  return agent;
}

function jpeg(width = 32, height = 24) {
  return sharp({ create: { width, height, channels: 3, background: '#3366ff' } }).jpeg().toBuffer();
}

beforeAll(async () => {
  await initialize();
  app = createApp();
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  for (const table of ['album_access', 'photos', 'albums', 'user_permissions', 'audit_logs', 'users']) {
    await db.query(`DELETE FROM ${table}`);
  }
});

describe('health', () => {
  it('reports a ready API', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, status: 'ok', database: 'sqlite', storage: 'local' });
  });
});

describe('auth', () => {
  it('rejects a bad password', async () => {
    const user = await createUser();
    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, error: 'INVALID_CREDENTIALS' });
  });

  it('returns null for visitors and the user once signed in', async () => {
    const anonymous = await request(app).get('/api/auth/me');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.data).toBeNull();

    const user = await createUser({ permissions: ['UPLOAD_PHOTOS'] });
    const agent = await signIn(user);
    const me = await agent.get('/api/auth/me');
    expect(me.body.data).toMatchObject({ id: user.id, email: user.email, permissions: ['UPLOAD_PHOTOS'] });
    expect(me.body.data.password_hash).toBeUndefined();

    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).body.data).toBeNull();
  });

  it('changes the password only with the current one', async () => {
    const user = await createUser();
    const agent = await signIn(user);
    const wrong = await agent.post('/api/auth/change-password').send({ currentPassword: 'nope-nope', newPassword: 'NewPassword456!' });
    expect(wrong.status).toBe(400);
    const ok = await agent.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'NewPassword456!' });
    expect(ok.status).toBe(200);
  });
});

describe('cross-site protection', () => {
  it('rejects state-changing requests from another origin', async () => {
    const user = await createUser({ role: 'main_admin' });
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: user.email, password: PASSWORD });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN_ORIGIN');
  });

  it('accepts requests from the configured frontend', async () => {
    const user = await createUser();
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: user.email, password: PASSWORD });
    expect(response.status).toBe(200);
  });
});

describe('permissions and protected albums', () => {
  it('blocks album creation without CREATE_ALBUMS', async () => {
    const agent = await signIn(await createUser());
    const response = await agent.post('/api/albums').send({ name: 'Album test', visibility: 'public' });
    expect(response.status).toBe(403);
  });

  it('blocks protected album photos without access', async () => {
    const owner = await createUser();
    const visitor = await createUser();
    const album = await albumRepository.createAlbum({ name: 'Privé', visibility: 'protected', passwordHash: null });
    await albumRepository.setAlbumAccess(album.id, [owner.id]);

    const visitorAgent = await signIn(visitor);
    expect((await visitorAgent.get(`/api/albums/${album.id}/photos`)).status).toBe(403);
    expect((await visitorAgent.get('/api/albums')).body.data).toHaveLength(0);

    const ownerAgent = await signIn(owner);
    expect((await ownerAgent.get(`/api/albums/${album.id}/photos`)).status).toBe(200);
    expect((await ownerAgent.get('/api/albums')).body.data).toHaveLength(1);
  });

  it('unlocks a password-protected album for the session without leaking the hash', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const adminAgent = await signIn(admin);
    const created = await adminAgent.post('/api/albums').send({ name: 'Mariage', visibility: 'protected', password: 'secret-album' });
    expect(created.status).toBe(201);
    expect(created.body.data.hasPassword).toBe(true);
    expect(JSON.stringify(created.body)).not.toContain('$2');

    const visitor = request.agent(app);
    const locked = await visitor.get(`/api/albums/${created.body.data.id}`);
    expect(locked.status).toBe(403);
    expect(locked.body.error).toBe('ALBUM_PASSWORD_REQUIRED');

    const wrong = await visitor.get(`/api/albums/${created.body.data.id}`).set('x-album-password', 'not-it');
    expect(wrong.body.error).toBe('INVALID_ALBUM_PASSWORD');

    const unlocked = await visitor.get(`/api/albums/${created.body.data.id}`).set('x-album-password', 'secret-album');
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.data.passwordHash).toBeUndefined();

    // Session remembers the unlock.
    expect((await visitor.get(`/api/albums/${created.body.data.id}/photos`)).status).toBe(200);
    expect((await visitor.get('/api/albums')).body.data.map((a) => a.id)).toContain(created.body.data.id);
  });

  it('answers 404 for malformed ids', async () => {
    expect((await request(app).get('/api/albums/abc')).status).toBe(404);
    expect((await request(app).get('/api/photos/1.5/thumbnail')).status).toBe(404);
  });
});

describe('uploads', () => {
  it('rejects non-JPEG files and files over 1 MB', async () => {
    const user = await createUser({ permissions: ['UPLOAD_PHOTOS'] });
    const agent = await signIn(user);
    const album = await albumRepository.createAlbum({ name: 'A', visibility: 'public', passwordHash: null });

    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const invalid = await agent.post(`/api/albums/${album.id}/photos`).attach('photos', png, { filename: 'image.png', contentType: 'image/png' });
    expect(invalid.status).toBe(400);

    const disguised = await agent.post(`/api/albums/${album.id}/photos`).attach('photos', png, { filename: 'image.jpg', contentType: 'image/jpeg' });
    expect(disguised.status).toBe(400);
    expect(disguised.body.error).toBe('INVALID_CONTENT');

    const huge = Buffer.alloc(1024 * 1024 + 1, 0xff);
    const tooBig = await agent.post(`/api/albums/${album.id}/photos`).attach('photos', huge, { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(tooBig.status).toBe(413);
  });

  it('rejects too many files with a clear 400', async () => {
    const agent = await signIn(await createUser({ permissions: ['UPLOAD_PHOTOS'] }));
    const album = await albumRepository.createAlbum({ name: 'B', visibility: 'public', passwordHash: null });
    const image = await jpeg();
    let req = agent.post(`/api/albums/${album.id}/photos`);
    for (let i = 0; i < 5; i += 1) req = req.attach('photos', image, { filename: `p${i}.jpg`, contentType: 'image/jpeg' });
    const response = await req;
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('TOO_MANY_FILES');
  });

  it('stores a JPEG, serves its thumbnail and lets it be moved and deleted', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const source = await albumRepository.createAlbum({ name: 'Vacances', visibility: 'public', passwordHash: null });
    const target = await albumRepository.createAlbum({ name: 'Archives', visibility: 'public', passwordHash: null });

    const uploaded = await agent.post(`/api/albums/${source.id}/photos`).attach('photos', await jpeg(800, 600), { filename: 'plage.jpg', contentType: 'image/jpeg' });
    expect(uploaded.status).toBe(201);
    const [photo] = uploaded.body.data;
    expect(photo).toMatchObject({ originalName: 'plage.jpg', width: 800, height: 600 });
    expect(photo.originalPath).toBeUndefined();

    const thumbnail = await request(app).get(`/api/photos/${photo.id}/thumbnail`);
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(thumbnail.body).metadata()).width).toBeLessThanOrEqual(640);

    const albums = (await request(app).get('/api/albums')).body.data;
    expect(albums.find((a) => a.id === source.id)).toMatchObject({ photosCount: 1, coverPhotoId: photo.id });

    const moved = await agent.post('/api/photos/move').send({ photoId: photo.id, targetAlbumId: target.id });
    expect(moved.status).toBe(200);
    expect(fs.existsSync(path.join(tempDir, 'Pictures', 'Archives', 'original'))).toBe(true);
    expect((await request(app).get(`/api/photos/${photo.id}/file`)).status).toBe(200);

    expect((await agent.delete(`/api/photos/${photo.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/photos/${photo.id}/file`)).status).toBe(404);
  });
});

describe('user management', () => {
  it('prevents a user manager from creating a main administrator', async () => {
    const manager = await createUser({ permissions: ['MANAGE_USERS'] });
    const agent = await signIn(manager);
    const response = await agent.post('/api/users').send({ name: 'Boss', email: 'boss@example.com', password: 'Password123!', role: 'main_admin' });
    expect(response.status).toBe(403);
  });

  it('deletes a user who uploaded photos', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const uploader = await createUser({ permissions: ['UPLOAD_PHOTOS'] });
    const album = await albumRepository.createAlbum({ name: 'C', visibility: 'public', passwordHash: null });
    const uploaderAgent = await signIn(uploader);
    await uploaderAgent.post(`/api/albums/${album.id}/photos`).attach('photos', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });

    const adminAgent = await signIn(admin);
    expect((await adminAgent.delete(`/api/users/${uploader.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/albums/${album.id}/photos`)).body.data).toHaveLength(1);
  });
});
