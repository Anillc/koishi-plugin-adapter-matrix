import { Modulator, Universal, segment } from '@satorijs/satori'
import { MatrixBot } from './bot'

export class MatrixModulator extends Modulator<MatrixBot> {
  private buffer: string = ''
  private reply: Universal.Message = null

  async sendMedia(url: string, type: 'file' | 'image' | 'video' | 'audio') {
    try {
      const session = this.bot.session(this.session)
      const { data, filename, mime } = await this.bot.ctx.http.file(url)
      const id = await this.bot.internal.sendMediaMessage(
        this.channelId, this.bot.userId, type, Buffer.from(data), this.reply?.messageId, mime, filename
      )
      session.messageId = id
      this.results.push(session)
      this.reply = null
    } catch (e) {
      this.errors.push(e)
    }
  }

  async flush() {
    if (!this.buffer) return
    try {
      const session = this.bot.session(this.session)
      if (this.reply) {
        this.buffer = `> <${this.reply.userId}> ${this.reply.content}\n\n` + this.buffer
      }
      const id = await this.bot.internal.sendTextMessage(
        this.channelId, this.bot.userId, this.buffer, this.reply?.messageId
      )
      session.messageId = id
      this.results.push(session)
      this.buffer = ''
      this.reply = null
    } catch (e) {
      this.errors.push(e)
    }
  }

  async visit(element: segment) {
    const { type, attrs, children } = element
    if (type === 'text') {
      this.buffer += attrs.content.replace(/[\\*_`~|]/g, '\\$&')
    } else if (type === 'b' || type === 'strong') {
      this.buffer += '**'
      await this.render(children)
      this.buffer += '**'
    } else if (type === 'i' || type === 'em') {
      this.buffer += '*'
      await this.render(children)
      this.buffer += '*'
    } else if (type === 'u' || type === 'ins') {
      this.buffer += '__'
      await this.render(children)
      this.buffer += '__'
    } else if (type === 's' || type === 'del') {
      this.buffer += '~~'
      await this.render(children)
      this.buffer += '~~'
    } else if (type === 'code') {
      this.buffer += '`'
      await this.render(children)
      this.buffer += '`'
    } else if (type === 'a') {
      this.buffer += '['
      await this.render(children)
      this.buffer += `](${attrs.href})`
    } else if (type === 'p') {
      await this.render(children)
      this.buffer += '\n'
    } else if (type === 'at') {
      if (attrs.id) {
        this.buffer += ` @${attrs.id} `
      } else if (attrs.type === 'all') {
        this.buffer += ` @room `
      }
    } else if (type === 'sharp' && attrs.id) {
      this.buffer += ` #${attrs.id} `
    } else if ((type === 'image' || type === 'video' || type === 'record' || type === 'file') && attrs.url) {
      await this.flush()
      const matrixType = type === 'record' ? 'audio' : type
      await this.sendMedia(attrs.url, matrixType)
    } else if (type === 'quote') {
      this.reply = await this.bot.getMessage(this.channelId, attrs.id)
    } else if (type === 'message') {
      await this.flush()
      await this.render(children, true)
    } else {
      await this.render(children)
    }
  }
}