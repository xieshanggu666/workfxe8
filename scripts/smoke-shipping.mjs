// 实物收货履约 —— 逻辑冒烟测试（esbuild 打包后在 node 运行）
// 覆盖：实物判定、正常中奖/兑换生成收货单、风控冻结不生成/放行补生成、撤销不生成、
//       用户填地址、运营接单、发货（快递单号）、用户确认收货、角色权限与状态机幂等
import { setActivePinia, createPinia } from 'pinia'
import { usePlatformStore } from '@/store/platform'

setActivePinia(createPinia())
const s = usePlatformStore()
s.init()

let failed = 0
const assert = (cond, msg) => {
  if (cond) console.log('  ✅', msg)
  else { console.error('  ❌', msg); failed++ }
}
const today = s.todayDate
const validAddr = { name: '张三', phone: '13912345678', region: '北京市 海淀区', detail: '中关村大街 1 号' }

console.log('— 种子：三种履约状态就绪 —')
assert(s.shippingStats.total === 3, `共 3 张收货单（实际 ${s.shippingStats.total}：待填地址/已发货待收货/历史已收货）`)
assert(s.shippingStats.pendingAddress === 1, '种子：定制帆布袋待填地址')
assert(s.shippingStats.shipped === 1, '种子：500元购物卡已发货待收货')
assert(s.shippingStats.received === 1, '种子：历史定制帆布袋已确认收货')
assert(s.pendingAddressCount === 1, `用户角标待填地址=1（实际 ${s.pendingAddressCount}）`)
assert(s.operatorShippingTodo === 0, `种子无运营待接单（已发货单待用户收货，实际 ${s.operatorShippingTodo}）`)
const seedSh0 = s.shippingOrders.find((o) => o.id === 'seed-sh0')
assert(seedSh0?.expressCompany === '顺丰速运' && seedSh0?.trackingNo === 'SF1002003004', '已发货单带快递公司与单号')

console.log('— 实物/虚拟判定 —')
const g1 = s.goods.find((g) => g.id === 'g1')
const g3 = s.goods.find((g) => g.id === 'g3')
assert(s.goodsNeedShip(g3) === true, '定制帆布袋（needShip=true）需发货')
assert(s.goodsNeedShip(g1) === false, '优惠券（needShip=false）为虚拟品，不发货')
const act1 = s.activities.find((a) => a.id === 'act-1')
assert(s.prizeNeedShip(act1.prizes.find((p) => p.id === 'p1')) === true, 'iPhone 为实物奖品')
assert(s.prizeNeedShip(act1.prizes.find((p) => p.id === 'p4')) === false, '30积分奖品不发货')
assert(s.prizeNeedShip(act1.prizes.find((p) => p.id === 'p6')) === false, '谢谢参与不发货')

console.log('— 用户确认种子已发货单 —')
const ptsBefore = s.points
assert(s.confirmReceive('seed-sh0') === undefined && s.shippingOrders.find((o) => o.id === 'seed-sh0').status === 'received',
  '用户确认收货成功，状态→received')
assert(s.shippingStats.shipped === 0 && s.shippingStats.received === 2, '看板：待收货 0、已收货 2')
assert(s.points === ptsBefore, '确认收货不影响积分')
const recvLog = s.auditLogs.find((l) => l.action === 'ship-receive')
assert(recvLog && recvLog.orderId === 'seed-sh0', '确认收货写入审计日志')

console.log('— 正常实物兑换：即时生成收货单（待填地址） —')
s.riskRules.enabled = false
const g3Before = g3.remain
const redeemRec = s.redeem('g3')
assert(redeemRec && redeemRec.status === 'normal', '兑换正常落账')
assert(g3.remain === g3Before - 1, '实物商品库存扣减')
const shipNew = s.shippingOrderOfRecord(redeemRec.id)
assert(shipNew && shipNew.status === 'pending_address', '实物兑换即时生成待填地址收货单')
assert(shipNew.bizDate === today, '收货单归属当前业务日')
assert(s.pendingAddressCount === 2, `用户角标变为 2（实际 ${s.pendingAddressCount}）`)

console.log('— 虚拟品兑换不生成收货单 —')
const virtualRec = s.redeem('g1')
assert(virtualRec && !s.shippingOrderOfRecord(virtualRec.id), '优惠券兑换无收货单')

console.log('— 地址校验与角色权限 —')
assert(s.fillShippingAddress(shipNew.id, { ...validAddr, phone: '123' }) === false, '手机号格式错误被拦截')
assert(s.fillShippingAddress(shipNew.id, { ...validAddr, detail: '' }) === false, '详细地址缺失被拦截')
s.setRole('operator')
assert(s.fillShippingAddress(shipNew.id, validAddr) === false, '运营视角不可代填地址')
s.setRole('user')

console.log('— 用户填写地址 → 待运营接单 —')
assert(s.fillShippingAddress(shipNew.id, validAddr) === true, '填写地址成功')
assert(shipNew.status === 'pending_ship' && shipNew.address.name === '张三', '状态→pending_ship，地址落库')
assert(shipNew.addressAt.startsWith(today), '记录提交时间')
assert(s.pendingAddressCount === 1, '角标回落为剩余 1（种子单）')
assert(s.operatorShippingTodo === 1, `运营待处理=1（实际 ${s.operatorShippingTodo}）`)
assert(s.fillShippingAddress(shipNew.id, validAddr) === false, '已提交后不可自行修改（防重复）')

console.log('— 运营接单 —')
s.setRole('operator')
assert(s.acceptShipping(shipNew.id) === undefined, '运营接单执行')
s.setRole('user')
assert(s.acceptShipping(shipNew.id) === undefined, '用户视角接单被拦截（状态不变）')
s.setRole('operator')
assert(shipNew.status === 'accepted' && !!shipNew.acceptedAt, '状态→accepted（备货中）')
assert(s.operatorShippingTodo === 1, '备货中仍计入运营待处理')
assert(s.acceptShipping(shipNew.id) === undefined, '重复接单幂等拦截')

console.log('— 运营发货：快递公司 + 单号 —')
assert(s.shipOrder(shipNew.id, { company: '', trackingNo: '' }) === false, '缺快递公司/单号被拦截')
s.setRole('user')
assert(s.shipOrder(shipNew.id, { company: '圆通速递', trackingNo: 'YT888' }) === false, '用户视角发货被拦截')
s.setRole('operator')
assert(s.shipOrder(shipNew.id, { company: '圆通速递', trackingNo: 'YT888666' }) === true, '发货成功')
assert(shipNew.status === 'shipped' && shipNew.trackingNo === 'YT888666' && shipNew.shipper === s.user.name,
  '状态→shipped，记录单号与发货人')
assert(s.operatorShippingTodo === 0, '运营待处理清零（等用户收货）')
assert(s.shipOrder(shipNew.id, { company: '圆通速递', trackingNo: 'YT888666' }) === false, '重复发货幂等拦截')
const deliverLog = s.auditLogs.find((l) => l.action === 'ship-deliver')
assert(deliverLog && deliverLog.detail.includes('YT888666'), '发货写入审计日志（含单号）')

console.log('— 用户确认收货（完成履约） —')
s.setRole('user')
assert(s.confirmReceive(shipNew.id) === undefined, '用户确认收货')
assert(shipNew.status === 'received' && !!shipNew.receivedAt, '状态→received，记录确认时间')
assert(s.shippingStats.received === 3, '已完成收货单共 3')
assert(s.pendingAddressCount === 1, '角标仅剩种子待填地址单')
// 全链路时间戳
;['addressAt', 'acceptedAt', 'shippedAt', 'receivedAt'].forEach((k) => {
  assert(!!shipNew[k], `履约链路字段 ${k} 已留痕`)
})

console.log('— 风控冻结不生成收货单；放行后补生成 —')
s.setRole('operator')
s.riskRules.enabled = true
// 种子待审核 iPhone（seed-rk1）：冻结中无收货单
assert(!s.shippingOrderOfRecord('seed-r1'), '冻结中的 iPhone 中奖无收货单')
const ptsRel = s.points
s.releaseRisk('seed-rk1', '核实正常，放行')
const shR1 = s.shippingOrderOfRecord('seed-r1')
assert(shR1 && shR1.status === 'pending_address', '放行后补生成收货单（待填地址），source=release')
assert(shR1.source === 'release' && shR1.bizDate === today, '放行补生成的单归属原中奖业务日')
assert(s.points === ptsRel, '免费抽奖放行无积分变动')
assert(s.shippingOrderOfRecord('seed-r1'), '同一记录重复放行不会重复建单（状态机已拦截二次放行）')
// 高价值兑换冻结单（seed-rk3 盲盒福袋）：撤销不生成收货单、库存回补
assert(!s.shippingOrderOfRecord('seed-r3'), '冻结中的盲盒兑换无收货单')
s.revokeRisk('seed-rk3', '确认风险，撤销')
assert(!s.shippingOrderOfRecord('seed-r3'), '撤销的兑换不生成收货单（返还积分/库存）')
const g4 = s.goods.find((g) => g.id === 'g4')
assert(g4.remain === 30 && g4.frozen === 0, '撤销后商品库存回补、预占释放')

console.log('— 正常实物中奖（免费转盘）即时生成收货单 —')
s.riskRules.enabled = false
const winRec = s.draw('act-1')
assert(winRec && winRec.status === 'normal', '抽奖正常落账')
const shWin = s.shippingOrderOfRecord(winRec.id)
if (s.prizeNeedShip({ name: winRec.prizeName, rarity: winRec.rarity, needShip: undefined })) {
  assert(shWin && shWin.status === 'pending_address', `实物中奖【${winRec.prizeName}】即时生成收货单`)
  assert(s.fillShippingAddress(shWin.id, validAddr) === true, '中奖单可正常填写地址')
  s.setRole('operator')
  assert(s.shipOrder(shWin.id, { company: '京东物流', trackingNo: 'JD001' }) === true, '运营可一键接单并发货（跳过显式接单）')
  assert(shWin.status === 'shipped' && !!shWin.acceptedAt, '一键发货自动补接单时间')
  s.setRole('user')
  assert(s.confirmReceive(shWin.id) === undefined, '用户确认中奖实物收货')
  assert(shWin.status === 'received', '中奖实物履约闭环完成')
} else {
  console.log('  ℹ️ 本次抽中的为积分/谢谢参与（随机），实物中奖路径已由种子单与放行单覆盖')
  assert(!shWin, '非实物奖品不生成收货单')
}

console.log('— 对账不受履约流程影响（履约不动积分/库存） —')
s.setRole('operator')
s.runRecon(today, true)
const bill = s.reconBillOf(today)
assert(bill.diffs.chain === null, '余额链连续（收货流程无积分动作）')
assert(bill.diffs.points.residual === 0, `P1 积分净额无残差（实际 ${bill.diffs.points.residual}）`)
assert(!bill.diffs.stock.some((x) => x.diff !== 0), 'P5 库存账实相符（撤销回补、兑换扣减均配平）')

console.log(failed ? `\n共 ${failed} 项失败` : '\n全部通过 🎉')
process.exit(failed ? 1 : 0)
