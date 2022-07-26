exports.Text = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendTextMessage(
        req.body.id,
        req.body.message
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Image = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.body.path,
        req.body.file,
        'image',
        req.body?.caption,
        req.body.mimetype
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Video = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.body.path,
        req.body.file,
        'video',
        req.body?.caption,
        req.body.mimetype
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Audio = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaFile(
        req.body.id,
        req.body.path,
        req.body.file,
        'audio',
        req.body.mimetype
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Document = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendDocFile(
        req.body.id,
        req.body.path,
        req.body.file,
        'document',
        '',
        req.body.mimetype,
        req.body.filename
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Link = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendLinkMessage(
        req.body.id,
        req.body.textbefore,
        req.body.url,
        req.body.textafter,
        req.body.title,
        req.body.description,
        req.body.path,
        req.body.file
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Button = async (req, res) => {
    // console.log(res.body)
    const data = await WhatsAppInstances[req.query.key].sendButtonMessage(
        req.body.id,
        req.body.btndata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Contact = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendContactMessage(
        req.body.id,
        req.body.vcard
    )
    return res.status(201).json({ error: false, data: data })
}

exports.List = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendListMessage(
        req.body.id,
        req.body.msgdata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.MediaButton = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaButtonMessage(
        req.body.id,
        req.body.btndata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Location = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendLocationMessage(
        req.body.id,
        req.body.locdata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Reaction = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendReactionMessage(
        req.body.id,
        req.body.reacdata
    )
    return res.status(201).json({ error: false, data: data })
}

exports.TemplateButton = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendTemplateButtonMessage(
        req.body.id,
        req.body.btndata,
        req.body.whurl
    )
    return res.status(201).json({ error: false, data: data })
}

exports.Pix = async (req, res) => {
    const data = await WhatsAppInstances[req.query.key].sendMediaPix(
        req.body.id,
        req.body.base64code,
    )
    return res.status(201).json({ error: false, data: data })
}

