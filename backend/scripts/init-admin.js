const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { migrate } = require('../src/db/migrate');
const db = require('../src/config/db');
const userRepository = require('../src/repositories/userRepository');
const { hashPassword } = require('../src/utils/password');

async function askMissingValues() {
  const values = {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  };
  if (values.name && values.email && values.password) return values;

  const rl = readline.createInterface({ input, output });
  try {
    if (!values.name) values.name = (await rl.question('Nom de l’administrateur principal : ')).trim();
    if (!values.email) values.email = (await rl.question('Email : ')).trim().toLowerCase();
    if (!values.password) values.password = (await rl.question('Mot de passe (8 caractères min.) : ')).trim();
  } finally {
    rl.close();
  }
  return values;
}

async function main() {
  await migrate();
  const { name, email, password } = await askMissingValues();

  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 8) {
    throw new Error('Valeurs invalides (email valide et mot de passe de 8 caractères minimum requis).');
  }
  if (await userRepository.findByEmail(email)) {
    throw new Error('Un utilisateur existe déjà avec cet email.');
  }

  const admin = await userRepository.createUser({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'main_admin',
    status: 'active',
  });
  console.log(`Administrateur principal créé (id ${admin.id}).`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
