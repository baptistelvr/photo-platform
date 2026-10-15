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
  for (const table of ['site_settings', 'album_photos', 'album_access', 'photos', 'albums', 'collections', 'user_permissions', 'audit_logs', 'users']) {
    await db.query(`DELETE FROM ${table}`);
  }
  fs.rmSync(path.join(tempDir, 'Pictures'), { recursive: true, force: true });
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

describe('home page showcase', () => {
  it('only returns photos from public albums, and only lets the CDN cache those', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const pub = await albumRepository.createAlbum({ name: 'Public', visibility: 'public', passwordHash: null });
    const priv = await albumRepository.createAlbum({ name: 'Privé', visibility: 'protected', passwordHash: null });
    const image = await jpeg(40, 30);
    const upload = (album, name) => agent.post(`/api/albums/${album.id}/photos`).attach('photos', image, { filename: name, contentType: 'image/jpeg' });
    const publicPhoto = (await upload(pub, 'a.jpg')).body.data[0];
    const privatePhoto = (await upload(priv, 'b.jpg')).body.data[0];

    const response = await request(app).get('/api/photos/showcase?limit=10');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ totalPhotos: 1, totalAlbums: 1 });
    expect(response.body.data.photos).toEqual([{ id: publicPhoto.id, albumId: pub.id, width: 40, height: 30 }]);

    const publicImage = await request(app).get(`/api/photos/${publicPhoto.id}/thumbnail`);
    expect(publicImage.headers['cache-control']).toContain('s-maxage');
    const privateImage = await agent.get(`/api/photos/${privatePhoto.id}/thumbnail`);
    expect(privateImage.headers['cache-control']).toBe('private, max-age=3600');
  });
});

describe('collections', () => {
  it('lists a collection only to viewers who can open one of its albums', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const voyages = (await agent.post('/api/collections').send({ name: 'Voyages' })).body.data;
    const famille = (await agent.post('/api/collections').send({ name: 'Famille' })).body.data;
    await agent.post('/api/albums').send({ name: 'Rome', visibility: 'public', collectionId: voyages.id });
    await agent.post('/api/albums').send({ name: 'Mariage', visibility: 'protected', password: 'secret-album', collectionId: famille.id });

    const anonymous = await request(app).get('/api/collections');
    expect(anonymous.body.data.map((c) => c.name)).toEqual(['Voyages']);
    expect(anonymous.body.data[0]).toMatchObject({ albumsCount: 1, photosCount: 0 });
    expect((await request(app).get(`/api/collections/${famille.id}`)).status).toBe(404);

    const detail = await request(app).get(`/api/collections/${voyages.id}`);
    expect(detail.body.data.albums.map((a) => a.name)).toEqual(['Rome']);
    expect(detail.body.data.albums[0]).toMatchObject({ collectionId: voyages.id, collectionName: 'Voyages' });

    // Managers also see collections they cannot browse yet, so they can fill them.
    const empty = (await agent.post('/api/collections').send({ name: 'Vide' })).body.data;
    expect((await agent.get('/api/collections')).body.data.map((c) => c.id)).toContain(empty.id);
  });

  it('lists the photos of a collection for the slideshow, without albums the viewer cannot open', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const collection = (await agent.post('/api/collections').send({ name: 'Cuba' })).body.data;
    const add = async (name, visibility, files) => {
      const album = (await agent.post('/api/albums').send({ name, visibility, collectionId: collection.id, ...(visibility === 'protected' ? { password: 'secret-album' } : {}) })).body.data;
      for (const file of files) {
        await agent.post(`/api/albums/${album.id}/photos`).attach('photos', await jpeg(), { filename: file, contentType: 'image/jpeg' });
      }
      return album;
    };
    await add('Trinidad', 'public', ['plaza.jpg']);
    await add('Bayamo', 'public', ['casa.jpg', 'trova.jpg']);
    const secret = await add('Privé', 'protected', ['secret.jpg']);

    const anonymous = await request(app).get(`/api/collections/${collection.id}/photos`);
    expect(anonymous.status).toBe(200);
    // Albums in the collection's order (creation order until someone reorders), photos in upload order.
    expect(anonymous.body.data.map((p) => `${p.albumName}/${p.originalName}`)).toEqual(['Trinidad/plaza.jpg', 'Bayamo/casa.jpg', 'Bayamo/trova.jpg']);
    expect(anonymous.body.data[0]).not.toHaveProperty('originalPath');

    const everything = await agent.get(`/api/collections/${collection.id}/photos`);
    expect(everything.body.data.filter((p) => p.albumId === secret.id)).toHaveLength(1);
    expect((await request(app).get('/api/collections/999999/photos')).status).toBe(404);
  });

  it('moves photo files when a collection is renamed and deletes everything with it', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const collection = (await agent.post('/api/collections').send({ name: 'Voyages' })).body.data;
    const album = (await agent.post('/api/albums').send({ name: 'Rome', visibility: 'public', collectionId: collection.id })).body.data;
    const photo = (await agent.post(`/api/albums/${album.id}/photos`).attach('photos', await jpeg(), { filename: 'colisee.jpg', contentType: 'image/jpeg' })).body.data[0];
    const pictures = path.join(tempDir, 'Pictures');
    expect(fs.readdirSync(path.join(pictures, 'Voyages', 'Rome', 'original'))).toHaveLength(1);

    expect((await agent.put(`/api/collections/${collection.id}`).send({ name: 'Italie' })).status).toBe(200);
    expect(fs.readdirSync(path.join(pictures, 'Italie', 'Rome', 'original'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(pictures, 'Voyages', 'Rome', 'original'))).toHaveLength(0);
    expect((await request(app).get(`/api/photos/${photo.id}/thumbnail`)).status).toBe(200);

    expect((await agent.delete(`/api/collections/${collection.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/albums/${album.id}`)).status).toBe(404);
    expect(fs.readdirSync(path.join(pictures, 'Italie', 'Rome', 'original'))).toHaveLength(0);
  });
});

describe('manual order', () => {
  const upload = async (agent, albumId, name) => (
    await agent.post(`/api/albums/${albumId}/photos`).attach('photos', await jpeg(), { filename: name, contentType: 'image/jpeg' })
  ).body.data[0];
  const photoNames = async (albumId) => (await request(app).get(`/api/albums/${albumId}/photos`)).body.data.map((p) => p.originalName);

  it('keeps photos in upload order, lets editors reorder them, and the first one is the cover', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const album = (await agent.post('/api/albums').send({ name: 'Rome', visibility: 'public' })).body.data;
    const a = await upload(agent, album.id, 'a.jpg');
    const b = await upload(agent, album.id, 'b.jpg');
    const c = await upload(agent, album.id, 'c.jpg');
    expect(await photoNames(album.id)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect((await request(app).get(`/api/albums/${album.id}`)).body.data.coverPhotoId).toBe(a.id);

    const editor = await signIn(await createUser({ permissions: ['VIEW_PUBLIC_ALBUMS', 'EDIT_ALBUMS'] }));
    // Only part of the list: the photos left out keep their order after it.
    const reordered = await editor.put(`/api/albums/${album.id}/photos/order`).send({ ids: [c.id, a.id] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.coverPhotoId).toBe(c.id);
    expect(await photoNames(album.id)).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
    expect((await request(app).get(`/api/albums/${album.id}`)).body.data.coverPhotoId).toBe(c.id);

    const viewer = await signIn(await createUser({ permissions: ['VIEW_PUBLIC_ALBUMS'] }));
    expect((await viewer.put(`/api/albums/${album.id}/photos/order`).send({ ids: [b.id] })).status).toBe(403);

    const other = (await agent.post('/api/albums').send({ name: 'Paris', visibility: 'public' })).body.data;
    const stranger = await upload(agent, other.id, 'tour.jpg');
    const invalid = await editor.put(`/api/albums/${album.id}/photos/order`).send({ ids: [stranger.id, a.id] });
    expect(invalid.status).toBe(400);
    expect((await editor.put(`/api/albums/${album.id}/photos/order`).send({ ids: [a.id, a.id] })).status).toBe(400);

    // Choosing a cover the old way moves that photo to the front.
    const cover = await agent.put(`/api/albums/${album.id}`).send({ name: 'Rome', visibility: 'public', coverPhotoId: b.id });
    expect(cover.body.data.coverPhotoId).toBe(b.id);
    expect(await photoNames(album.id)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);

    // A moved photo goes at the end of its new album.
    await agent.post('/api/photos/move').send({ photoId: b.id, targetAlbumId: other.id });
    expect(await photoNames(other.id)).toEqual(['tour.jpg', 'b.jpg']);
    expect((await request(app).get(`/api/albums/${album.id}`)).body.data.coverPhotoId).toBe(c.id);
  });

  it('orders albums in a collection (the first gives the cover), collections, and picks home page collections', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const voyages = (await agent.post('/api/collections').send({ name: 'Voyages' })).body.data;
    const famille = (await agent.post('/api/collections').send({ name: 'Famille' })).body.data;
    const amis = (await agent.post('/api/collections').send({ name: 'Amis' })).body.data;
    const album = async (name, collectionId) => (await agent.post('/api/albums').send({ name, visibility: 'public', collectionId })).body.data;
    const rome = await album('Rome', voyages.id);
    const oslo = await album('Oslo', voyages.id);
    const lima = await album('Lima', voyages.id);
    const romePhoto = await upload(agent, rome.id, 'colisee.jpg');
    const osloPhoto = await upload(agent, oslo.id, 'fjord.jpg');

    const names = async (id) => (await request(app).get(`/api/collections/${id}`)).body.data.albums.map((a) => a.name);
    expect(await names(voyages.id)).toEqual(['Rome', 'Oslo', 'Lima']);
    expect((await request(app).get(`/api/collections/${voyages.id}`)).body.data.coverPhotoId).toBe(romePhoto.id);

    const editor = await signIn(await createUser({ permissions: ['VIEW_PUBLIC_ALBUMS', 'EDIT_ALBUMS'] }));
    expect((await editor.put('/api/albums/order').send({ collectionId: voyages.id, ids: [oslo.id, rome.id] })).status).toBe(200);
    expect(await names(voyages.id)).toEqual(['Oslo', 'Rome', 'Lima']);
    expect((await request(app).get('/api/collections')).body.data.find((c) => c.id === voyages.id).coverPhotoId).toBe(osloPhoto.id);
    // The slideshow follows the same order.
    expect((await request(app).get(`/api/collections/${voyages.id}/photos`)).body.data.map((p) => p.albumName)).toEqual(['Oslo', 'Rome']);

    const elsewhere = await album('Noël', famille.id);
    expect((await editor.put('/api/albums/order').send({ collectionId: voyages.id, ids: [elsewhere.id] })).status).toBe(400);
    expect((await editor.put('/api/albums/order').send({ collectionId: 999999, ids: [] })).status).toBe(400);

    // An album moved to another collection goes last there.
    await agent.put(`/api/albums/${lima.id}`).send({ name: 'Lima', visibility: 'public', collectionId: famille.id });
    expect(await names(famille.id)).toEqual(['Noël', 'Lima']);

    // Albums without a collection have their own order.
    const loose1 = await album('Divers', null);
    const loose2 = await album('Brouillons', null);
    expect((await editor.put('/api/albums/order').send({ collectionId: null, ids: [loose2.id, loose1.id] })).status).toBe(200);
    const all = (await request(app).get('/api/albums')).body.data.map((a) => a.name);
    expect(all.slice(-2)).toEqual(['Brouillons', 'Divers']);

    const collectionNames = async () => (await agent.get('/api/collections')).body.data.map((c) => c.name);
    expect(await collectionNames()).toEqual(['Voyages', 'Famille', 'Amis']);
    expect((await editor.put('/api/collections/order').send({ ids: [amis.id, voyages.id] })).status).toBe(200);
    expect(await collectionNames()).toEqual(['Amis', 'Voyages', 'Famille']);
    expect((await agent.post('/api/collections').send({ name: 'Zoo' })).status).toBe(201);
    expect(await collectionNames()).toEqual(['Amis', 'Voyages', 'Famille', 'Zoo']);

    // Home page selection, kept when the collection is renamed without the flag.
    expect((await editor.put(`/api/collections/${voyages.id}`).send({ name: 'Voyages', featured: true })).body.data.featured).toBe(true);
    await editor.put(`/api/collections/${voyages.id}`).send({ name: 'Grands voyages' });
    const listed = (await request(app).get('/api/collections')).body.data;
    expect(listed.filter((c) => c.featured).map((c) => c.name)).toEqual(['Grands voyages']);
    const viewer = await signIn(await createUser({ permissions: ['VIEW_PUBLIC_ALBUMS'] }));
    expect((await viewer.put('/api/collections/order').send({ ids: [famille.id] })).status).toBe(403);
  });

  it('gives existing rows the order they were displayed in', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const collection = (await agent.post('/api/collections').send({ name: 'Archives' })).body.data;
    const album = async (name) => (await agent.post('/api/albums').send({ name, visibility: 'public', collectionId: collection.id })).body.data;
    const zebre = await album('Zèbre');
    await album('avion');
    await album('Été 10');
    await album('Été 9');
    const a = await upload(agent, zebre.id, 'a.jpg');
    const b = await upload(agent, zebre.id, 'b.jpg');
    await upload(agent, zebre.id, 'c.jpg');

    // Back to the state before manual ordering: no order, a hand-picked cover, one album per photo.
    await db.query('DELETE FROM album_photos');
    await db.query('UPDATE photos SET sort_order = NULL');
    await db.query('UPDATE albums SET sort_order = NULL, cover_photo_id = CASE WHEN id = $1 THEN CAST($2 AS INTEGER) ELSE NULL END', [zebre.id, b.id]);
    await db.query('UPDATE collections SET sort_order = NULL');
    await require('../src/db/migrate').migrate();

    // The old cover first, then newest first as the gallery used to show.
    expect(await photoNames(zebre.id)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
    expect((await request(app).get(`/api/collections/${collection.id}`)).body.data.albums.map((x) => x.name))
      .toEqual(['avion', 'Été 9', 'Été 10', 'Zèbre']);
    expect(a.id).toBeLessThan(b.id);
  });
});

describe('sub-albums', () => {
  it('nests albums as deep as wanted, with their own photos, order and cover', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const voyages = (await agent.post('/api/collections').send({ name: 'Voyages' })).body.data;
    const create = async (name, extra) => (await agent.post('/api/albums').send({ name, visibility: 'public', ...extra })).body.data;
    const cuba = await create('Cuba', { collectionId: voyages.id });
    const havane = await create('La Havane', { parentId: cuba.id });
    const vieille = await create('Vieille ville', { parentId: havane.id });
    const trinidad = await create('Trinidad', { parentId: cuba.id });
    expect(vieille.collectionId).toBe(voyages.id);
    const photo = (await agent.post(`/api/albums/${vieille.id}/photos`).attach('photos', await jpeg(), { filename: 'capitole.jpg', contentType: 'image/jpeg' })).body.data[0];
    // Files go in the folder of the whole chain.
    expect(fs.readdirSync(path.join(tempDir, 'Pictures', 'Voyages', 'Cuba', 'La Havane', 'Vieille ville', 'original'))).toHaveLength(1);

    // The collection shows its top-level album only, whose cover comes from deep inside.
    const collection = (await request(app).get(`/api/collections/${voyages.id}`)).body.data;
    expect(collection.albums.map((a) => a.name)).toEqual(['Cuba']);
    expect(collection.coverPhotoId).toBe(photo.id);

    const album = (await request(app).get(`/api/albums/${havane.id}`)).body.data;
    expect(album.ancestors.map((a) => a.name)).toEqual(['Cuba']);
    expect(album.subAlbums.map((a) => a.name)).toEqual(['Vieille ville']);
    expect(album.coverPhotoId).toBe(photo.id);
    expect((await request(app).get(`/api/albums/${cuba.id}`)).body.data.subAlbums.map((a) => a.name)).toEqual(['La Havane', 'Trinidad']);

    // The flat list reads parents before their sub-albums.
    expect((await request(app).get('/api/albums')).body.data.map((a) => `${a.depth}:${a.name}`))
      .toEqual(['0:Cuba', '1:La Havane', '2:Vieille ville', '1:Trinidad']);

    // Sub-albums are reordered among themselves.
    expect((await agent.put('/api/albums/order').send({ collectionId: voyages.id, parentId: cuba.id, ids: [trinidad.id, havane.id] })).status).toBe(200);
    expect((await request(app).get(`/api/albums/${cuba.id}`)).body.data.subAlbums.map((a) => a.name)).toEqual(['Trinidad', 'La Havane']);
    expect((await agent.put('/api/albums/order').send({ collectionId: voyages.id, parentId: cuba.id, ids: [vieille.id] })).status).toBe(400);

    // An album cannot go inside itself; renaming a parent moves the files below it.
    expect((await agent.put(`/api/albums/${cuba.id}`).send({ name: 'Cuba', visibility: 'public', parentId: vieille.id })).status).toBe(400);
    expect((await agent.put(`/api/albums/${havane.id}`).send({ name: 'Havane', visibility: 'public' })).status).toBe(200);
    expect(fs.readdirSync(path.join(tempDir, 'Pictures', 'Voyages', 'Cuba', 'Havane', 'Vieille ville', 'original'))).toHaveLength(1);
    expect((await request(app).get(`/api/photos/${photo.id}/file`)).status).toBe(200);

    // Moving a branch to another collection takes its sub-albums along.
    const famille = (await agent.post('/api/collections').send({ name: 'Famille' })).body.data;
    await agent.put(`/api/albums/${havane.id}`).send({ name: 'Havane', visibility: 'public', parentId: null, collectionId: famille.id });
    expect((await request(app).get(`/api/albums/${vieille.id}`)).body.data.collectionId).toBe(famille.id);
    expect((await request(app).get(`/api/collections/${famille.id}`)).body.data.albums.map((a) => a.name)).toEqual(['Havane']);

    // Deleting an album deletes its sub-albums and their photos.
    expect((await agent.delete(`/api/albums/${havane.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/albums/${vieille.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/photos/${photo.id}/file`)).status).toBe(404);
  });
});

describe('photos in several albums', () => {
  it('shows one photo in several albums without copying its file', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const create = async (name, visibility = 'public') => (await agent.post('/api/albums').send({ name, visibility, ...(visibility === 'protected' ? { password: 'secret-album' } : {}) })).body.data;
    const rome = await create('Rome');
    const best = await create('Best of');
    const prive = await create('Privé', 'protected');
    const other = await create('Archives');
    const [photo] = (await agent.post(`/api/albums/${prive.id}/photos`)
      .field('alsoIn', String(other.id))
      .attach('photos', await jpeg(), { filename: 'colisee.jpg', contentType: 'image/jpeg' })).body.data;
    expect(photo.albumIds).toEqual([prive.id, other.id].sort((a, b) => a - b));

    // Not public yet: protected album only... and Archives (public).
    expect((await request(app).get(`/api/albums/${other.id}/photos`)).body.data.map((p) => p.id)).toEqual([photo.id]);

    const viewer = await signIn(await createUser({ permissions: ['VIEW_PUBLIC_ALBUMS'] }));
    expect((await viewer.post(`/api/photos/${photo.id}/albums`).send({ albumIds: [best.id] })).status).toBe(403);
    const copied = await agent.post(`/api/photos/${photo.id}/albums`).send({ albumIds: [rome.id, best.id] });
    expect(copied.status).toBe(200);
    expect(copied.body.data.albumIds).toHaveLength(4);
    const files = () => fs.readdirSync(path.join(tempDir, 'Pictures'), { recursive: true }).filter((f) => String(f).endsWith('.jpg'));
    expect(files()).toHaveLength(2); // one original, one thumbnail

    // Readable through a public album even though it lives in a protected one.
    expect((await request(app).get(`/api/photos/${photo.id}/thumbnail`)).status).toBe(200);
    const listed = (await request(app).get(`/api/albums/${best.id}/photos`)).body.data[0];
    expect(listed.albumIds).toHaveLength(4);

    // Taking it out of its home album moves the files to another of its albums.
    expect((await agent.delete(`/api/albums/${prive.id}/photos/${photo.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/albums/${prive.id}/photos`, { headers: {} })).status).toBe(403);
    expect((await agent.get(`/api/albums/${prive.id}/photos`)).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/photos/${photo.id}/file`)).status).toBe(200);

    // Moving from one album to another: leaves Rome, joins nothing new if already there.
    const moved = await agent.post('/api/photos/move').send({ photoId: photo.id, fromAlbumId: rome.id, targetAlbumId: best.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data.albumIds).not.toContain(rome.id);

    // Its last album cannot be left; deleting an album keeps photos shown elsewhere.
    expect((await agent.delete(`/api/albums/${best.id}`)).status).toBe(200);
    expect((await agent.delete(`/api/albums/${other.id}/photos/${photo.id}`)).status).toBe(400);
    expect((await request(app).get(`/api/photos/${photo.id}/file`)).status).toBe(200);
    expect(files()).toHaveLength(2);

    expect((await agent.delete(`/api/photos/${photo.id}`)).status).toBe(200);
    expect(files()).toHaveLength(0);
  });
});

describe('site settings', () => {
  it('stores the home page texts, theme and wall source, and feeds the wall from chosen albums only', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const defaults = (await request(app).get('/api/settings/site')).body.data;
    expect(defaults).toMatchObject({ heroTitle: '', theme: 'classique', showcase: { mode: 'all', albumIds: [] } });

    const create = async (name, visibility = 'public') => (await agent.post('/api/albums').send({ name, visibility, ...(visibility === 'protected' ? { password: 'secret-album' } : {}) })).body.data;
    const best = await create('Best of');
    const sub = (await agent.post('/api/albums').send({ name: 'Best of 2024', visibility: 'public', parentId: best.id })).body.data;
    const autre = await create('Autre');
    const secret = await create('Secret', 'protected');
    const up = async (albumId, name) => (await agent.post(`/api/albums/${albumId}/photos`).attach('photos', await jpeg(), { filename: name, contentType: 'image/jpeg' })).body.data[0];
    const p1 = await up(best.id, 'a.jpg');
    const p2 = await up(sub.id, 'b.jpg');
    await up(autre.id, 'c.jpg');
    await up(secret.id, 'd.jpg');

    const all = (await request(app).get('/api/photos/showcase')).body.data;
    expect(all.totalPhotos).toBe(3);

    const viewer = await signIn(await createUser({ permissions: ['VIEW_PUBLIC_ALBUMS'] }));
    expect((await viewer.put('/api/settings/site').send({ theme: 'noel' })).status).toBe(403);
    expect((await agent.put('/api/settings/site').send({ theme: 'carnaval' })).status).toBe(400);
    const saved = await agent.put('/api/settings/site').send({
      heroTitle: 'Nos voyages', heroSubtitle: 'en images', heroText: 'Bienvenue !', theme: 'noel',
      showcase: { mode: 'albums', albumIds: [best.id, secret.id, 999999] },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.showcase.albumIds).toEqual([best.id, secret.id]);
    expect((await request(app).get('/api/settings/site')).body.data).toMatchObject({ heroTitle: 'Nos voyages', theme: 'noel' });

    // Best of and its sub-album; the protected album never shows on the wall.
    const wall = (await request(app).get('/api/photos/showcase')).body.data;
    expect(wall.photos.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
    expect(wall.totalPhotos).toBe(2);
  });
});

describe('storage maintenance', () => {
  it('reports photos whose files are gone and forgets them on request', async () => {
    const admin = await createUser({ role: 'main_admin' });
    const agent = await signIn(admin);
    const album = (await agent.post('/api/albums').send({ name: 'Perdu', visibility: 'public' })).body.data;
    await agent.post(`/api/albums/${album.id}/photos`).attach('photos', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    const kept = (await agent.post('/api/albums').send({ name: 'Gardé', visibility: 'public' })).body.data;
    await agent.post(`/api/albums/${kept.id}/photos`).attach('photos', await jpeg(), { filename: 'b.jpg', contentType: 'image/jpeg' });
    fs.rmSync(path.join(tempDir, 'Pictures', 'Perdu'), { recursive: true });

    const status = await agent.get('/api/admin/storage');
    expect(status.body.data).toMatchObject({ driver: 'local', photos: 2, missing: 1 });

    const pruned = await agent.post('/api/admin/storage/prune').send({ deleteEmptyAlbums: true });
    expect(pruned.body.data).toEqual({ removedPhotos: 1, removedAlbums: 1 });
    expect((await agent.get('/api/admin/storage')).body.data).toMatchObject({ photos: 1, missing: 0 });
    expect((await request(app).get('/api/albums')).body.data.map((a) => a.name)).toEqual(['Gardé']);
  });

  it('is reserved to administrators', async () => {
    const agent = await signIn(await createUser({ permissions: ['UPLOAD_PHOTOS'] }));
    expect((await agent.get('/api/admin/storage')).status).toBe(403);
  });
});
