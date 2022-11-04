import { Adapter, Context, Logger } from '@satorijs/satori'
import { Context as KoaContext } from 'koa'
import { MatrixBot } from './bot'
import { adaptSession, dispatchSession } from './utils'
import { ClientEvent, M_ROOM_MEMBER } from './types'

declare module 'koa' {
  interface Context {
    bots: MatrixBot[]
  }
}

const logger = new Logger('matrix')

export class HttpAdapter extends Adapter.Server<MatrixBot> {
  private txnId: string = null

  public constructor(ctx: Context) {
    super()
    const router = ctx.router.use((ctx, next) => {
      const bots = this.bots.filter(bot => (bot instanceof MatrixBot) && (bot.hsToken === ctx.query.access_token))
      if (!bots.length) {
        ctx.body = { errcode: 'M_FORBIDDEN' }
        return
      }
      ctx.bots = bots
      next()
    })
    const put = (path: string, callback: (ctx: KoaContext) => void) => {
      router.put(path, callback.bind(this))
      router.put('/_matrix/app/v1' + path, callback.bind(this))
    }
    const get = (path: string, callback: (ctx: KoaContext) => void) => {
      router.get(path, callback.bind(this))
      router.get('/_matrix/app/v1' + path, callback.bind(this))
    }
    put('/transactions/:txnId', this.transactions)
    get('/users/:userId', this.users)
    get('/room/:roomAlias', this.rooms)
  }

  async start(bot: MatrixBot): Promise<void> {
    try {
      await bot.initialize()
      bot.online()
    } catch(e) {
      logger.error('failed to initialize', e)
      throw e
    }
  }

  private transactions(ctx: KoaContext) {
    const { txnId } = ctx.params
    const events = ctx.request.body.events as ClientEvent[]
    ctx.body = {}
    if (txnId === this.txnId) return
    this.txnId = txnId
    for (const event of events) {
      const bots = ctx.bots.filter(bot => bot.rooms.includes(event.room_id))
      let bot: MatrixBot
      if (event.type === 'm.room.member'
        && (event.content as M_ROOM_MEMBER).membership === 'invite'
        && (bot = ctx.bots.find(bot => bot.userId === event.state_key))
        && !bots.includes(bot)) {
        bots.push(bot)
      }
      ctx.bots.forEach(bot => dispatchSession(bot, event))
    }
  }

  private users(ctx: KoaContext) {
    ctx.body = {}
  }

  private rooms(ctx: KoaContext) {
    ctx.body = {}
  }
}
