import { geminiClient } from '../ai/gemini';
import { buildBotSystemPrompt } from '../ai/prompts';
import type { FinancialContext } from '../ai/prompts';

const mockContext: FinancialContext = {
  user: {
    id: 'test-user',
    telegram_chat_id: null,
    telegram_username: null,
    default_currency: 'ARS',
    timezone: 'America/Argentina/Buenos_Aires',
    notification_time: '22:00:00',
    daily_summary_enabled: true,
    weekly_summary_enabled: true,
    monthly_summary_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  accounts: [
    {
      id: '1',
      user_id: 'test-user',
      name: 'Efectivo ARS',
      type: 'cash',
      currency: 'ARS',
      balance: 50000,
      icon: '💵',
      color: '#10B981',
      is_debt: false,
      include_in_total: true,
      min_balance: null,
      sort_order: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '2',
      user_id: 'test-user',
      name: 'Visa',
      type: 'credit_card',
      currency: 'ARS',
      balance: -15000,
      icon: '💳',
      color: '#1A1F71',
      is_debt: true,
      include_in_total: false,
      min_balance: null,
      sort_order: 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  categories: [
    { id: '1', user_id: null, name: 'Comida', type: 'expense', icon: '🍔', parent_id: null, is_system: true, created_at: new Date().toISOString() },
    { id: '2', user_id: null, name: 'Transporte', type: 'expense', icon: '🚗', parent_id: null, is_system: true, created_at: new Date().toISOString() },
    { id: '3', user_id: null, name: 'Sueldo', type: 'income', icon: '💼', parent_id: null, is_system: true, created_at: new Date().toISOString() },
  ],
  monthSummary: {
    totalExpenses: 120000,
    totalIncome: 800000,
    topCategories: [
      { name: 'Comida', amount: 45000 },
      { name: 'Transporte', amount: 28000 },
    ],
  },
};

export async function testBotParsing(message: string): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 INPUT:', message);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const systemPrompt = buildBotSystemPrompt(mockContext);

  try {
    const tier = geminiClient.getTierForRequest(message, false);
    console.log(`🤖 Usando tier: ${tier.toUpperCase()}\n`);

    const response = await geminiClient.chat(message, {
      tier,
      systemInstruction: systemPrompt,
      maxTokens: 1024,
    });

    console.log('🎯 RESPONSE RAW:');
    console.log(response);
    console.log('\n');

    try {
      const parsed = JSON.parse(response);
      console.log('✅ PARSED JSON:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log('⚠️ Response no es JSON válido');
    }
  } catch (error) {
    console.error('❌ ERROR:', error);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

if (require.main === module) {
  const message = process.argv[2] || 'gasté 5000 en el super';
  testBotParsing(message);
}
