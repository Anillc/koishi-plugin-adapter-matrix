import { MatrixBot } from './bot'
import * as Matrix from './types'

declare module '@satorijs/satori' {
  interface Session {
      matrix: Matrix.Internal & Matrix.ClientEvent
  }
}

export * from './types'
export default MatrixBot