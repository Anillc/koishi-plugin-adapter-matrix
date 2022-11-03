import { Adapter, Context } from 'koishi'
import { Context as KoaContext } from 'koa'
import { BotConfig, MatrixBot } from './bot'
import { AdapterConfig, dispatchSession } from './utils'
import { ClientEvent } from './types'

export class HttpAdapter extends Adapter.Server<MatrixBot> {
  private txnId: string = null

  fork(ctx: Context, bot: MatrixBot) {
    const router = ctx.router.use((ctx, next) => {
      const bot = this.bots.find(bot => (bot instanceof MatrixBot) && (bot.hsToken === ctx.query.access_token))
      if (!bot) {
        ctx.body = { errcode: 'M_FORBIDDEN' }
        return
      }
      ctx.bot = bot
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

  async connect(bot: MatrixBot): Promise<void> {
    try {
      await bot.internal.register(bot.selfId)
    } catch (e) {
      if (e.response.status !== 400) throw e
    }
    const { avatar } = await bot.getUser(bot.userId)
    bot.avatar = avatar
  }

  private transactions(ctx: KoaContext) {
    const { txnId } = ctx.params
    const events = ctx.request.body.events as ClientEvent[]
    ctx.body = {}
    if (txnId === this.txnId) return
    this.txnId = txnId
    for (const event of events) {
      dispatchSession(ctx.bot, event)
    }
  }

  private users(ctx: KoaContext) {
    ctx.body = {}
  }

  private rooms(ctx: KoaContext) {
    ctx.body = {}
  }
}
