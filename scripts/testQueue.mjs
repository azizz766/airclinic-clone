import { notificationQueue } from '../lib/queue.ts'

await notificationQueue.add('send', {
  id: 'cmo6logx9000v04i86qet11i6'
})

console.log('✅ Job added')
process.exit(0)
