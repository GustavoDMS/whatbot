/* eslint-disable no-unsafe-optional-chaining */
const QRCode = require('qrcode');
const pino = require('pino');
const {
    default: makeWASocket,
    useSingleFileAuthState,
    DisconnectReason,
    delay,
} = require('@adiwajshing/baileys');
const { unlinkSync, readFileSync } = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const processButton = require('../helper/processbtn');
const generateVC = require('../helper/genVc');
// const Chat = require("../models/chat.model")
const axios = require('axios');
const config = require('../../config/config');
const downloadMessage = require('../helper/downloadMsg');
const mysql = require("mysql");

class WhatsAppInstance {
    socketConfig = {
        printQRInTerminal: false,
        browser: ['FastBot N8N MD', '', '3.0'],
        logger: pino({
            level: 'silent',
        }),
    };
    key = '';
    authState;
    allowWebhook = true;
    instance = {
        key: this.key,
        chats: [],
        qr: '',
        messages: [],
    };

    axiosInstance = axios.create({
        baseURL: config.webhookUrl,
    });

    db = mysql.createConnection({
        host: config.mysql.host,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
    });


    constructor(key, allowWebhook = true, webhook = null) {
        this.key = key ? key : uuidv4();
        this.allowWebhook = allowWebhook;
        if (this.allowWebhook && webhook !== null) {
            this.axiosInstance = axios.create({
                baseURL: webhook,
            });
        }
        this.authState = useSingleFileAuthState(
            path.join(__dirname, `../sessiondata/${this.key}.json`),
        );
        
    this.db.connect((err) => {
        if (err) {
            console.log("Error occurred", err);
          } 
          else {
            console.log("Connected to database");
           
          }
    });

    }
    
    async sqlQuery (dbConnection,data) {
        return new Promise((resolve, reject) => {
          dbConnection.query('SELECT whUrl FROM tb_users WHERE remoteJid = '+data.key.remoteJid.split('@')[0], function (err, result) {
            if (err) reject(err);
            //dbConnection.end();
            resolve(result);
          });
        
        });
    }

    async SendWebhook(data) {
        if (!this.allowWebhook) return;
        const result = await this.sqlQuery(this.db, data);
        if (result.length > 0 && result[0].whUrl !== null && result[0].whUrl !== '') {
            const webhook = result[0].whUrl;
            await axios.post(webhook, data).catch((error) => {
                console.log(error);
                return;
            });
        }
        else {
            this.axiosInstance.post('', data).catch((error) => {
                return;
            });
        }

        //var sql = "SELECT whUrl FROM tb_users WHERE remoteJid = '"+data.key.remoteJid.split('@')[0];
        // var sql = "SELECT whUrl FROM tb_users WHERE remoteJid = 5521987769674";
        // await this.db.query(sql, function (err, result) {
        // if(result.length > 0){
        //     this.axiosInstance.post(result[0].whUrl, data).catch((error) => {
        //         return;
        //     });
        // }
        // else{
        //     this.axiosInstance.post('', data).catch((error) => {
        //         return;
        //     });
        // }
        // });
        
    }

    async init() {
        this.socketConfig.auth = this.authState.state;
        this.instance.sock = makeWASocket(this.socketConfig);
        this.setHandler();
        return this;
    }

    setHandler() {
        const sock = this.instance.sock;
        // on credentials update save state
        sock?.ev.on('creds.update', this.authState.saveState);

        // on socket closed, opened, connecting
        sock?.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection == 'connecting') return;

            if (connection === 'close') {
                // reconnect if not logged out
                if (
                    lastDisconnect?.error?.output?.statusCode !==
                    DisconnectReason.loggedOut
                ) {
                    await this.init();
                } else {
                    unlinkSync(
                        path.join(__dirname, `../sessiondata/${this.key}.json`),
                    );
                    this.instance.online = false;
                }
            } else if (connection === 'open') {
                this.instance.online = true;
            }

            if (qr) {
                QRCode.toDataURL(qr).then((url) => {
                    this.instance.qr = url;
                    this.SendWebhook({
                        type: 'update',
                        message: 'Received QR Code',
                        key: this.key,
                        qrcode: url,
                    });
                });
            }
        });

        // on receive all chats
        sock?.ev.on('chats.set', async ({ chats }) => {
            const recivedChats = chats.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                };
            });
            this.instance.chats.push(...recivedChats);
            //    const db = await Chat({key: this.key, chat: this.instance.chats})
            //    await db.save()
            //    console.log(db)
        });

        // on recive new chat
        sock?.ev.on('chats.upsert', (newChat) => {
            // console.log("Received new chat")
            const chats = newChat.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                };
            });
            this.instance.chats.push(...chats);
        });

        // on chat change
        sock?.ev.on('chats.update', (changedChat) => {
            changedChat.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (pc) => pc.id === chat.id,
                );
                const PrevChat = this.instance.chats[index];
                this.instance.chats[index] = {
                    ...PrevChat,
                    ...chat,
                };
            });
        });

        // on chat delete
        sock?.ev.on('chats.delete', (deletedChats) => {
            deletedChats.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (c) => c.id === chat,
                );
                this.instance.chats.splice(index, 1);
            });
        });

        // on new mssage
        sock?.ev.on('messages.upsert', (m) => {
            if (m.type == 'prepend')
                this.instance.messages.unshift(...m.messages);
            if (m.type != 'notify') return;

            this.instance.messages.unshift(...m.messages);

            m.messages.map(async (msg) => {
                if (!msg.message) return;
                if (msg.key.fromMe) return;

                const messageType = Object.keys(msg.message)[0];
                if (
                    [
                        'protocolMessage',
                        'senderKeyDistributionMessage',
                    ].includes(messageType)
                )
                    return;

                const webhookData = {
                    key: this.key,
                    ...msg,
                };

                if (messageType === 'conversation') {
                    webhookData[this.key, 'text'] = m;
                }
                if (config.webhookBase64) {
                    switch (messageType) {
                        case 'imageMessage':
                            webhookData['msgContent'] = await downloadMessage(
                                msg.message.imageMessage,
                                'image',
                            );
                            break;
                        case 'videoMessage':
                            webhookData['msgContent'] = await downloadMessage(
                                msg.message.videoMessage,
                                'video',
                            );
                            break;
                        case 'audioMessage':
                            webhookData['msgContent'] = await downloadMessage(
                                msg.message.audioMessage,
                                'audio',
                            );
                            break;
                        default:
                            webhookData['msgContent'] = '';
                            break;
                    }
                }

                this.SendWebhook(webhookData);
            });
        });
    }

    async getInstanceDetail(key) {
        return {
            instance_key: key,
            phone_connected: this.instance?.online,
            user: this.instance?.online ? this.instance.sock?.user : {},
        };
    }

    getWhatsAppId(id) {
        if (id.includes('@g.us') || id.includes('@s.whatsapp.net')) return id;
        return id.includes('-') ? `${id}@g.us` : `${id}@s.whatsapp.net`;
    }

    async verifyId(id) {
        if (id.includes('@g.us')) return true;
        const [result] = await this.instance.sock?.onWhatsApp(id);
        if (result?.exists) return true;
        throw new Error('no account exists');
    }

    async sendTextMessage(to, message) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            { 
            		text: message 
            },
        );
        return data;
    }

    async sendMediaFile(to, path, file, type, caption = '', mimetype) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [type]: { url: path + file },
                mimetype: mimetype,
                caption: caption,
                ptt: type === 'audio' ? true : false,
            },
        );
        return data;
    }

    async sendMediaPix(to, base64code) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                image: Buffer.from(base64code, "base64"),
                mimetype: "image/png"
            },
        );
        return data;
    }

    async sendDocFile(to, path, file, type, caption = '', mimetype, filename) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                mimetype: mimetype,
                [type]: { url: path + file },
                caption: caption,
                fileName: filename ? filename : file,
            },
        );
        return data;
    }

    async sendLinkMessage(to, textbefore = '', url, textafter = '', title, description, path, file) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            { 
		            text: textbefore + ' ' + url + ' ' + textafter,
		            matchedText: url,
		            canonicalUrl: url,
		            title: title,
		            description: description,
		            jpegThumbnail: readFileSync(path + file),
            },
        );
        return result;
    }

    async DownloadProfile(of) {
        await this.verifyId(this.getWhatsAppId(of));
        const ppUrl = await this.instance.sock?.profilePictureUrl(
            this.getWhatsAppId(of),
            'image',
        );
        return ppUrl;
    }

    async getUserStatus(of) {
        await this.verifyId(this.getWhatsAppId(of));
        const status = await this.instance.sock?.fetchStatus(
            this.getWhatsAppId(of),
        );
        return status;
    }

    async blockUnblock(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        const status = await this.instance.sock?.updateBlockStatus(
            this.getWhatsAppId(to),
            data,
        );
        return status;
    }

    async sendButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                buttons: data.buttons ?? '',
                text: data.text ?? '',
                footer: data.footer ?? '',
                headerType: data.headerType ?? 1
            },
        );
        return result;
    }

    async sendTemplateButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                templateButtons: processButton(data.buttons),
                text: data.text ?? '',
                footer: data.footerText ?? '',
            },
        );
        return result;
    }

    async sendContactMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const vcard = generateVC(data);
        const result = await this.instance.sock?.sendMessage(
            await this.getWhatsAppId(to),
            {
                contacts: {
                    displayName: data.fullName,
                    contacts: [{ displayName: data.fullName, vcard }],
                },
            },
        );
        return result;
    }

    async sendListMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                text: data.text,
                sections: data.sections,
                buttonText: data.buttonText,
                footer: data.description,
                title: data.title,
            },
        );
        return result;
    }

    async sendMediaButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [data.mediaType]: {
                    url: data.path + data.image,
                },
                footer: data.footerText ?? '',
                caption: data.text,
                templateButtons: processButton(data.buttons),
                mimetype: data.mimeType,
            },
        );
        return result;
    }

    async sendLocationMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        await this.instance.sock?.presenceSubscribe(to);
        await delay(500);
        await this.instance.sock?.sendPresenceUpdate('composing', to);
        await delay(1000);
        await this.instance.sock?.sendPresenceUpdate('paused', to);
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            { 
            		location: 
            		{ 
            				degreesLatitude: data.latitude, 
            				degreesLongitude: data.longitude 
            		} 
            },
        );
        return result;
    }

    async sendReactionMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to));
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            { 
            		react: 
            		{ 
            				text: data.emoticon, 
            				key: {remoteJid: to, id: data.id, fromMe: false, participant: data.participant}
            		} 
            },
        );
        return result;
    }

    // Group Methods
    parseParticipants(users) {
        return users.map((users) => this.getWhatsAppId(users));
    }

    async createNewGroup(name, users) {
        const group = await this.instance.sock?.groupCreate(
            name,
            users.map(this.getWhatsAppId),
        );
        return group;
    }

    async addNewParticipant(id, users) {
        try {
            const res = await this.instance.sock?.groupAdd(
                this.getWhatsAppId(id),
                this.parseParticipants(users),
            );
            return res;
        } catch {
            return {
                error: true,
                message:
                    'Unable to add participant, you must be an admin in this group',
            };
        }
    }

    async makeAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupMakeAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users),
            );
            return res;
        } catch {
            return {
                error: true,
                message:
                    'unable to promote some participants, check if you are admin in group or participants exists',
            };
        }
    }

    async demoteAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupDemoteAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users),
            );
            return res;
        } catch {
            return {
                error: true,
                message:
                    'unable to demote some participants, check if you are admin in group or participants exists',
            };
        }
    }

    async getAllGroups() {
        // let AllChat = await Chat.findOne({key: key}).exec();
        return this.instance.chats.filter((c) => c.id.includes('@g.us'));
    }

    async leaveGroup(id) {
        const group = this.instance.chats.find((c) => c.id === id);
        if (!group) throw new Error('no group exists');
        return await this.instance.sock?.groupLeave(id);
    }

    async getInviteCodeGroup(id) {
        const group = this.instance.chats.find((c) => c.id === id);
        if (!group)
            throw new Error(
                'unable to get invite code, check if the group exists',
            );
        return await this.instance.sock?.groupInviteCode(id);
    }
}

exports.WhatsAppInstance = WhatsAppInstance;
