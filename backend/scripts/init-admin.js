const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { migrate } = require('../src/db/migrate');
const userRepository = require('../src/repositories/userRepository');
const { hashPassword } = require('../src/utils/password');
const { ALL_PERMISSIONS } = require('../src/constants/permissions');

async function askMissingValues() {
  const values = {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  };

  if (values.name && values.email && values.password) return values;

  const rl = readline.createInterface({ input, output });
  if (!values.name) values.name = (await rl.question('Nom administrateur principal: ')).trim();
  if (!values.email) values.email = (await rl.question('Email administrateur principal: ')).trim().toLowerCase();
  if (!values.password) values.password = (await rl.question('Mot de passe administrateur principal: ')).trim();
  rl.close();
  return values;
}

(async () => {
  await migrate();
  const { name, email, password } = await askMissingValues();

  if (!name || !email || !password || password.length < 8) {
    throw new Error('Valeurs admin invalides (mot de passe min 8 caractères).');
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

  await userRepository.setPermissions(admin.id, ALL_PERMISSIONS);
  console.log(`Admin principal créé avec l'ID ${admin.id}.`);
})();

