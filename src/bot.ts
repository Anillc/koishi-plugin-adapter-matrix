import { Bot, Context, omit, Quester, Schema, Fragment, Universal } from '@satorijs/satori'
import { HttpAdapter } from './http'
import { MatrixModulator } from './modulator'
import * as Matrix from './types'
import { adaptMessage, dispatchSession } from './utils'


export class MatrixBot extends Bot<MatrixBot.Config> {
    http: Quester
    hsToken: string
    asToken: string
    host: string
    userId: string
    endpoint: string
    internal: Matrix.Internal
    botToken: string
    rooms: string[] = []
    constructor(ctx: Context, config: MatrixBot.Config) {
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
      const sync = await this.syncRooms()
      // dispatch invitiations
      if (!sync?.rooms?.invite) return
      setTimeout(() => Object.entries(sync.rooms.invite).forEach(([roomId, room]) => {
        const event = room.invite_state.events.find(event =>
          event.type === 'm.room.member' && (event.content as Matrix.M_ROOM_MEMBER).membership === 'invite')
        event.room_id = roomId
        dispatchSession(this, event)
      }))
    }

    async sendMessage(channelId: string, content: Fragment, guildId?: string): Promise<string[]> {
      return new MatrixModulator(this, channelId, guildId).send(content)
    }

    async sendPrivateMessage(channelId: string, content: Fragment) {
      return new MatrixModulator(this, channelId).send(content)
    }

    async getMessage(channelId: string, messageId: string): Promise<Universal.Message> {
      const event = await this.internal.getEvent(channelId, messageId)
      return await adaptMessage(this, event)
    }

    async deleteMessage(channelId: string, messageId: string) {
      await this.internal.redactEvent(channelId, messageId)
    }

    async getSelf() {
      return await this.getUser(this.userId)
    }

    async getUser(userId: string): Promise<Universal.User> {
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

    async getChannel(channelId: string): Promise<Universal.Channel> {
      const events = await this.internal.getState(channelId)
      const channelName = (events.find(event => event.type === 'm.room.name')?.content as Matrix.M_ROOM_NAME)?.name
      return {
        channelId,
        channelName,
      }
    }

    async getChannelList(): Promise<Universal.Channel[]> {
      const rooms = await this.internal.getJoinedRooms()
      return await Promise.all(rooms.map(this.getChannel))
    }

    // as utils.ts commented, messageId is roomId
    async handleGuildRequest(messageId: string, approve: boolean, commit: string) {
      if (approve) {
        await this.internal.joinRoom(messageId, commit)
      } else {
        await this.internal.leaveRoom(messageId, commit)
      }
      this.syncRooms()
    }

    async syncRooms() {
      const sync = await this.internal.sync(true)
      if (!sync?.rooms?.join) return
      this.rooms = Object.keys(sync.rooms.join)
      return sync
    }
}

export namespace MatrixBot {
  export interface Config extends Bot.Config, Quester.Config {
    selfId?: string
    hsToken?: string
    asToken?: string
    host?: string
  }

  export const Config = Schema.object({
    selfId: Schema.string().description('机器人的 ID。机器人最后的用户名将会是 @${selfId}:${host}。').required(),
    host: Schema.string().description('Matrix homeserver 域名。').required(),
    hsToken: Schema.string().description('hs_token').role('secret').required(),
    asToken: Schema.string().description('as_token').role('secret').required(),
    endpoint: Schema.string().description('Matrix homeserver 地址。默认为 https://${host}。'),
    ...omit(Quester.Config.dict, ['endpoint']),
  })
}

MatrixBot.prototype.platform = 'matrix'