import { MatrixBot } from './bot'
import * as Matrix from './types'

declare module 'koishi' {
  interface Session {
      matrix: Matrix.Internal & Matrix.ClientEvent
  }
}

export default MatrixBot
