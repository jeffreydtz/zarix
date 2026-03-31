require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setUserPassword(email, password) {
  console.log(`🔐 Configurando password para: ${email}`);

  try {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      throw listError;
    }

    const user = users.users.find(u => u.email === email);

    if (!user) {
      console.log('❌ Usuario no encontrado. Creando nuevo usuario...');
      
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) throw error;
      
      console.log('✅ Usuario creado exitosamente');
      console.log('📧 Email:', data.user.email);
      console.log('🆔 ID:', data.user.id);
      return;
    }

    console.log('📧 Usuario encontrado, actualizando password...');
    
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (error) throw error;

    console.log('✅ Password actualizado exitosamente');
    console.log('📧 Email:', user.email);
    console.log('🆔 ID:', user.id);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('❌ Uso: node scripts/set-password.js EMAIL PASSWORD');
  console.log('📝 Ejemplo: node scripts/set-password.js jeff@example.com mipassword123');
  process.exit(1);
}

if (password.length < 6) {
  console.log('❌ La contraseña debe tener al menos 6 caracteres');
  process.exit(1);
}

setUserPassword(email, password);
