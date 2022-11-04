import { Bot, Context, omit, Quester, Schema, Fragment, Universal } from '@satorijs/satori'
import { HttpAdapter } from './http'
import { MatrixModulator } from './modulator'
import * as Matrix from './types'

export interface BotConfig extends Bot.Config, Quester.Config {
  selfId?: string
  hsToken?: string
  asToken?: string
  host?: string
}

export const BotConfig = Schema.object({
  selfId: Schema.string().description('机器人的 ID。').required(),
  host: Schema.string().description('Matrix homeserver 域名。').required(),
  hsToken: Schema.string().description('hs_token').required(),
  asToken: Schema.string().description('as_token').required(),
  endpoint: Schema.string().description('Matrix homeserver 地址。默认为 https://host 。'),
  ...omit(Quester.Config.dict, ['endpoint']),
})

export class MatrixBot extends Bot<BotConfig> {
    http: Quester
    hsToken: string
    asToken: string
    host: string
    userId: string
    endpoint: string
    internal: Matrix.Internal
    botToken: string
    constructor(ctx: Context, config: BotConfig) {
      super(ctx, config)
      this.selfId = config.selfId
      this.hsToken = config.hsToken
      this.asToken = config.asToken
      this.host = config.host
      this.userId = `@${this.selfId}:${this.host}`
      this.endpoint = (config.endpoint || `https://${config.host}`) + '/_matrix'
      this.internal = new Matrix.Internal(this)
      ctx.plugin(HttpAdapter, this)
    }

    async initialize() {
      let user: Matrix.User
      try {
        user = await this.internal.register(this.selfId, this.asToken)
      } catch (e) {
        if (e.response.status !== 400 && e.data.errcode !== 'M_USER_IN_USE') throw e
      }
      if (!user) user = await this.internal.login(this.selfId, this.asToken)
      this.http = this.ctx.http.extend({
        ...this.config,
        endpoint: this.endpoint,
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
        },
      })
      this.botToken = user.access_token
      this.avatar = (await this.getUser(this.userId)).avatar
    }

    async sendMessage(channelId: string, content: Fragment, guildId?: string): Promise<string[]> {
      return new MatrixModulator(this, channelId, guildId).send(content)
    }

    async sendPrivateMessage(channelId: string, content: Fragment) {
      return new MatrixModulator(this, channelId).send(content)
    }

    async getMessage(channelId: string, messageId: string): Promise<Universal.Message> {
      const event = await this.internal.getEvent(channelId, messageId)
      const content = event.content as Matrix.M_ROOM_MESSAGE
      const replyId = content['m.relates_to']?.['m.in_reply_to']
      let reply: Universal.Message
      if (replyId) reply = await this.getMessage(channelId, replyId)
      return {
        messageId,
        channelId,
        userId: event.sender,
        content: content.body,
        timestamp: event.origin_server_ts,
        author: {
          userId: event.sender,
          username: event.sender,
        },
        quote: reply,
      }
    }

    async getSelf() {
      return await this.getUser(this.userId)
    }

    async getUser(userId: string) {
      const profile = await this.internal.getProfile(userId)
      let avatar: string
      if (profile.avatar_url) avatar = this.internal.getAssetUrl(profile.avatar_url)
      return {
        userId,
        avatar,
        username: userId,
        nickname: profile.displayname,
      }
    }

    async getChannel(channelId: string, guildId?: string) {
      return {
        channelId,
      }
    }

    // as utils.ts commented, messageId is roomId
    async handleGuildRequest(messageId: string, approve: boolean, commit: string) {
      if (approve) {
        await this.internal.joinRoom(messageId, commit)
      } else {
        await this.internal.leaveRoom(messageId, commit)
      }
    }
}

MatrixBot.prototype.platform = 'matrix'