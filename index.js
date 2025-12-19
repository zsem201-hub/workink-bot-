const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ═══════════════════════════════════════
// SLASH COMMANDS REGISTRATION
// ═══════════════════════════════════════

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Dapatkan link untuk mengambil key')
        .addStringOption(option =>
            option.setName('hwid')
                .setDescription('Hardware ID kamu')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('validate')
        .setDescription('Validasi key yang sudah didapat')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Key yang ingin divalidasi')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('keyinfo')
        .setDescription('Informasi tentang sistem key'),
    
    new SlashCommandBuilder()
        .setName('genlink')
        .setDescription('[ADMIN] Generate link key untuk user')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User yang akan diberikan link')
                .setRequired(true))
];

// ═══════════════════════════════════════
// WORK INK API HANDLER
// ═══════════════════════════════════════

class WorkInkAPI {
    constructor(config) {
        this.apiKey = config.workink.apiKey;
        this.validationUrl = config.workink.validationUrl;
        this.keySystemUrl = config.workink.keySystemUrl;
    }

    // Generate link dengan HWID
    generateKeyLink(hwid) {
        return `${this.keySystemUrl}?hwid=${encodeURIComponent(hwid)}`;
    }

    // Validasi key (jika Work Ink menyediakan API validasi)
    async validateKey(key, hwid) {
        try {
            const response = await axios.get(this.validationUrl, {
                params: {
                    key: key,
                    hwid: hwid
                },
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Check key status
    async checkKeyStatus(key) {
        try {
            const response = await axios.post(this.validationUrl, {
                key: key,
                apiKey: this.apiKey
            }, {
                timeout: 10000
            });
            
            return response.data;
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

const workInk = new WorkInkAPI(config);

// ═══════════════════════════════════════
// DATABASE SEDERHANA (JSON)
// ═══════════════════════════════════════

const fs = require('fs');
const DB_FILE = './database.json';

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) {}
    return { users: {}, keys: {} };
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════

client.once('ready', async () => {
    console.log(`✅ Bot online sebagai ${client.user.tag}`);
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(config.token);
    
    try {
        console.log('🔄 Mendaftarkan slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        console.log('✅ Slash commands berhasil didaftarkan!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
    
    // Set activity
    client.user.setActivity('Key System | /getkey', { type: 3 });
});

// ═══════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // ─────────────────────────────────
    // /getkey - Dapatkan link key
    // ─────────────────────────────────
    if (commandName === 'getkey') {
        const hwid = interaction.options.getString('hwid');
        
        const keyLink = workInk.generateKeyLink(hwid);
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔑 Key System')
            .setDescription('Klik link di bawah untuk mendapatkan key Anda!')
            .addFields(
                { name: '📋 HWID Anda', value: `\`${hwid}\``, inline: true },
                { name: '🔗 Link Key', value: `[Klik Disini](${keyLink})`, inline: true }
            )
            .addFields(
                { name: '📝 Instruksi', value: 
                    '1️⃣ Klik link di atas\n' +
                    '2️⃣ Selesaikan checkpoint\n' +
                    '3️⃣ Copy key yang muncul\n' +
                    '4️⃣ Gunakan `/validate` untuk validasi'
                }
            )
            .setFooter({ text: 'Key berlaku selama 24 jam' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        
        // Log ke database
        const db = loadDatabase();
        db.users[interaction.user.id] = {
            hwid: hwid,
            lastRequest: new Date().toISOString()
        };
        saveDatabase(db);
    }

    // ─────────────────────────────────
    // /validate - Validasi key
    // ─────────────────────────────────
    else if (commandName === 'validate') {
        const key = interaction.options.getString('key');
        
        await interaction.deferReply({ ephemeral: true });
        
        const db = loadDatabase();
        const userData = db.users[interaction.user.id];
        
        if (!userData) {
            return interaction.editReply({
                content: '❌ Anda belum request key! Gunakan `/getkey` terlebih dahulu.'
            });
        }
        
        const result = await workInk.validateKey(key, userData.hwid);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Key Valid!')
                .setDescription('Key Anda berhasil divalidasi.')
                .addFields(
                    { name: '🔑 Key', value: `\`${key.substring(0, 10)}....\``, inline: true },
                    { name: '⏰ Berlaku', value: '24 jam', inline: true }
                )
                .setTimestamp();
            
            // Simpan key ke database
            db.keys[interaction.user.id] = {
                key: key,
                validatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24*60*60*1000).toISOString()
            };
            saveDatabase(db);
            
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Key Invalid!')
                .setDescription(result.error || 'Key tidak valid atau sudah expired.')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        }
    }

    // ─────────────────────────────────
    // /keyinfo - Info sistem key
    // ─────────────────────────────────
    else if (commandName === 'keyinfo') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('ℹ️ Informasi Key System')
            .setDescription('Sistem key untuk mengakses script.')
            .addFields(
                { name: '⏰ Durasi Key', value: '24 jam', inline: true },
                { name: '🔄 Reset', value: 'Setiap 24 jam', inline: true },
                { name: '📋 HWID', value: 'Diperlukan untuk generate key', inline: true }
            )
            .addFields(
                { name: '📝 Cara Mendapatkan Key', value: 
                    '```\n' +
                    '1. Jalankan script untuk mendapatkan HWID\n' +
                    '2. Gunakan /getkey <hwid>\n' +
                    '3. Selesaikan link checkpoint\n' +
                    '4. Copy key dan gunakan di script\n' +
                    '```'
                }
            )
            .setFooter({ text: 'Work Ink Key System' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ─────────────────────────────────
    // /genlink - Admin generate link
    // ─────────────────────────────────
    else if (commandName === 'genlink') {
        // Check admin permission
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ Anda tidak memiliki permission!', 
                ephemeral: true 
            });
        }
        
        const targetUser = interaction.options.getUser('user');
        
        const embed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('🔧 Admin Key Generator')
            .setDescription(`Link key untuk ${targetUser}`)
            .addFields(
                { name: '🔗 Key System Link', value: `[Buka Link](${config.workink.keySystemUrl})` },
                { name: '🔗 Validation URL', value: `\`${config.workink.validationUrl}\`` }
            )
            .setFooter({ text: `Generated by ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// ═══════════════════════════════════════
// LOGIN BOT
// ═══════════════════════════════════════

client.login(config.token);
