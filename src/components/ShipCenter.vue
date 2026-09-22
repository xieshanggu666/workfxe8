<template>
  <div class="ship-view">
    <!-- 顶部概览 + 角色切换 -->
    <div class="ship-hero">
      <div class="hero-stats">
        <div class="hs-item">
          <span class="hs-num warn">{{ stats.pendingAddress }}</span>
          <span class="hs-lab">待填地址</span>
        </div>
        <div class="hs-item">
          <span class="hs-num info">{{ stats.toShip }}</span>
          <span class="hs-lab">待运营发货</span>
        </div>
        <div class="hs-item">
          <span class="hs-num ok">{{ stats.shipped }}</span>
          <span class="hs-lab">已发货 / 待收货</span>
        </div>
        <div class="hs-item">
          <span class="hs-num muted">{{ stats.received }}</span>
          <span class="hs-lab">已完成收货</span>
        </div>
      </div>
      <div class="role-box">
        <span class="role-tip">当前视角</span>
        <div class="role-switch">
          <button :class="{ active: store.role === 'user' }" @click="store.setRole('user')">👤 用户（收货）</button>
          <button :class="{ active: store.role === 'operator' }" @click="store.setRole('operator')">📦 运营（接单发货）</button>
        </div>
      </div>
    </div>

    <!-- 用户视角：我的实物奖品/订单 -->
    <div v-if="!store.isOperator" class="card">
      <div class="card-title">
        📮 我的中奖 / 兑换实物
        <div class="filters">
          <button v-for="f in userFilters" :key="f.key"
                  :class="{ active: userFilter === f.key }" @click="userFilter = f.key">
            {{ f.label }}
            <em v-if="f.key !== 'all' && userCountOf(f.key)">({{ userCountOf(f.key) }})</em>
          </button>
        </div>
      </div>

      <!-- 待办提示 -->
      <div v-if="store.myShipTodoCount" class="todo-entry">
        <span v-if="addrTodos.length">📝 你有 <b>{{ addrTodos.length }}</b> 件实物待填写收货信息；
          <span v-if="receiveTodos.length"><b>{{ receiveTodos.length }}</b> 件已发货待确认收货</span>
        </span>
        <span v-else-if="receiveTodos.length">📦 你有 <b>{{ receiveTodos.length }}</b> 件实物已送达，记得确认收货</span>
      </div>

      <div v-if="visibleUserOrders.length === 0" class="empty">暂无实物中奖 / 兑换订单（积分奖品与虚拟券卡无需收货）</div>

      <div v-for="o in visibleUserOrders" :key="o.id" class="ship-order" :class="o.status">
        <div class="o-head">
          <span class="o-icon">{{ o.icon }}</span>
          <div class="o-main">
            <div class="o-title">
              {{ o.targetName }}
              <span class="o-src">{{ o.bizType === 'draw' ? '抽奖中奖' : '积分兑换' }} · {{ o.source }}</span>
            </div>
            <div class="o-sub">发货单 {{ o.id }} · {{ o.date }} {{ o.time }}</div>
          </div>
          <span class="o-status" :class="o.status">{{ statusMeta(o.status).label }}</span>
        </div>

        <!-- 待填地址 / 修改地址：表单 -->
        <div v-if="o.status === 'pending_address' || editingId === o.id" class="addr-form">
          <div class="af-row">
            <input v-model="addrForm(o).receiver" placeholder="收货人姓名" />
            <input v-model="addrForm(o).phone" placeholder="手机号（11 位）" maxlength="11" />
          </div>
          <div class="af-row">
            <input v-model="addrForm(o).region" placeholder="所在地区，如：上海市浦东新区" />
          </div>
          <div class="af-row">
            <input v-model="addrForm(o).address" placeholder="详细收货地址（街道/楼栋/门牌号）" />
          </div>
          <div class="af-actions">
            <button v-if="editingId === o.id" class="btn-ghost" @click="cancelEdit(o)">取消</button>
            <button class="btn-primary" @click="submitAddr(o)">{{ editingId === o.id ? '💾 保存修改' : '📮 提交收货信息' }}</button>
          </div>
        </div>

        <!-- 待发货：展示已填地址，可修改 -->
        <div v-else-if="o.status === 'to_ship'" class="addr-box">
          <div class="ab-info">
            <b>📍 {{ o.receiver }} {{ maskPhone(o.phone) }}</b>
            <span>{{ o.region }} {{ o.address }}</span>
            <em>提交于 {{ o.addressAt }} · 等待运营接单发货</em>
          </div>
          <button class="btn-ghost" @click="editAddress(o)">✏️ 修改地址</button>
        </div>

        <!-- 已发货：物流信息 + 确认收货 -->
        <div v-else-if="o.status === 'shipped'" class="ship-box">
          <div class="ab-info">
            <b>🚚 {{ o.carrier }} · {{ o.trackingNo }}</b>
            <span>📍 {{ o.receiver }} {{ maskPhone(o.phone) }} · {{ o.region }} {{ o.address }}</span>
            <em>运营 {{ o.shipper }} 于 {{ o.shippedAt }} 接单发货<span v-if="o.shipNote">；{{ o.shipNote }}</span></em>
          </div>
          <button class="btn-primary" @click="confirmReceive(o)">✅ 确认收货</button>
        </div>

        <!-- 已收货：完成态 -->
        <div v-else class="done-box">
          <div class="ab-info">
            <b>✅ 已收货，订单完成</b>
            <span>🚚 {{ o.carrier }} · {{ o.trackingNo }} · 📍 {{ o.region }} {{ o.address }}</span>
            <em>发货 {{ o.shippedAt }} · 收货 {{ o.receivedAt }}</em>
          </div>
        </div>
      </div>
    </div>

    <!-- 运营视角：接单发货队列 -->
    <div v-else class="card">
      <div class="card-title">
        📦 实物发货接单
        <div class="filters">
          <button v-for="f in opFilters" :key="f.key"
                  :class="{ active: opFilter === f.key }" @click="opFilter = f.key">
            {{ f.label }}
            <em v-if="f.key !== 'all' && opCountOf(f.key)">({{ opCountOf(f.key) }})</em>
          </button>
        </div>
      </div>

      <p class="op-hint">用户提交收货信息后进入「待发货」队列；运营填写快递公司与单号即视为接单发货，用户端同步可查物流并确认收货。</p>

      <div v-if="visibleOpOrders.length === 0" class="empty">暂无相关发货单</div>

      <div v-for="o in visibleOpOrders" :key="o.id" class="ship-order" :class="o.status">
        <div class="o-head">
          <span class="o-icon">{{ o.icon }}</span>
          <div class="o-main">
            <div class="o-title">
              {{ o.targetName }}
              <span class="o-src">{{ o.bizType === 'draw' ? '抽奖中奖' : '积分兑换' }} · {{ o.source }} · 用户 {{ o.userName }}</span>
            </div>
            <div class="o-sub">发货单 {{ o.id }} · {{ o.date }} {{ o.time }}</div>
          </div>
          <span class="o-status" :class="o.status">{{ statusMeta(o.status).label }}</span>
        </div>

        <!-- 待填地址：运营不可操作 -->
        <div v-if="o.status === 'pending_address'" class="op-wait">
          ⏳ 等待用户填写收货信息，暂不能发货
        </div>

        <!-- 待发货：收件信息 + 录快递单 -->
        <div v-else-if="o.status === 'to_ship'" class="op-ship">
          <div class="receiver-info">
            <b>📍 {{ o.receiver }} {{ o.phone }}</b>
            <span>{{ o.region }} {{ o.address }}</span>
            <em>用户提交于 {{ o.addressAt }}</em>
          </div>
          <div class="ship-form">
            <div class="sf-row">
              <select v-model="ensureShipForm(o).carrier">
                <option value="">选择快递公司</option>
                <option v-for="c in carriers" :key="c" :value="c">{{ c }}</option>
              </select>
              <input v-model="ensureShipForm(o).trackingNo" placeholder="快递单号" />
            </div>
            <div class="sf-row">
              <input v-model="ensureShipForm(o).note" placeholder="发货备注（可选，如：请当面验货）" />
              <button class="btn-primary" @click="doShip(o)">📦 接单发货</button>
            </div>
          </div>
        </div>

        <!-- 已发货 -->
        <div v-else-if="o.status === 'shipped'" class="ship-box op">
          <div class="ab-info">
            <b>🚚 {{ o.carrier }} · {{ o.trackingNo }}</b>
            <span>📍 {{ o.receiver }} {{ o.phone }} · {{ o.region }} {{ o.address }}</span>
            <em>{{ o.shipper }} 于 {{ o.shippedAt }} 发货，等待用户确认收货<span v-if="o.shipNote">；{{ o.shipNote }}</span></em>
          </div>
        </div>

        <!-- 已收货 -->
        <div v-else class="done-box">
          <div class="ab-info">
            <b>✅ 用户已确认收货</b>
            <span>🚚 {{ o.carrier }} · {{ o.trackingNo }}</span>
            <em>发货 {{ o.shippedAt }} · 收货 {{ o.receivedAt }}</em>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { usePlatformStore, SHIP_STATUS } from '@/store/platform'

const store = usePlatformStore()

const stats = computed(() => store.shipmentStats)
const statusMeta = (s) => SHIP_STATUS[s] || { label: s, tone: '' }
const maskPhone = (p) => p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')

const carriers = ['顺丰速运', '京东物流', '中通快递', '圆通速递', '韵达快递', 'EMS']

// —— 用户视角 ——
const userFilters = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待办' },
  { key: 'pending_address', label: '待填地址' },
  { key: 'to_ship', label: '待发货' },
  { key: 'shipped', label: '待收货' },
  { key: 'received', label: '已完成' }
]
const userFilter = ref('todo')
const myOrders = computed(() => store.myShipments)
const matchFilter = (o, key) => {
  if (key === 'all') return true
  if (key === 'todo') return o.status === 'pending_address' || o.status === 'shipped'
  return o.status === key
}
const visibleUserOrders = computed(() =>
  myOrders.value.filter((o) => matchFilter(o, userFilter.value)))
const userCountOf = (key) => myOrders.value.filter((o) => matchFilter(o, key)).length
const addrTodos = computed(() => myOrders.value.filter((o) => o.status === 'pending_address'))
const receiveTodos = computed(() => myOrders.value.filter((o) => o.status === 'shipped'))

const addrForms = reactive({})
const addrForm = (o) => {
  if (!addrForms[o.id]) {
    addrForms[o.id] = { receiver: o.receiver || '', phone: (o.phone || '').replace(/\*+/g, '') || '', region: o.region || '', address: o.address || '' }
  }
  return addrForms[o.id]
}
// 当前展开内联编辑的订单（仅 to_ship 阶段用户主动修改时使用）
const editingId = ref('')
function submitAddr(o) {
  if (store.submitShipAddress(o.id, addrForm(o))) {
    editingId.value = ''
    userFilter.value = 'to_ship'
  }
}
function editAddress(o) {
  addrForm(o)
  editingId.value = o.id
}
function cancelEdit(o) {
  addrForms[o.id] = { receiver: o.receiver || '', phone: (o.phone || '').replace(/\*+/g, '') || '', region: o.region || '', address: o.address || '' }
  editingId.value = ''
}
function confirmReceive(o) {
  store.receiveShipment(o.id)
}

// —— 运营视角 ——
const opFilters = [
  { key: 'all', label: '全部' },
  { key: 'to_ship', label: '待发货' },
  { key: 'pending_address', label: '待用户填地址' },
  { key: 'shipped', label: '已发货' },
  { key: 'received', label: '已收货' }
]
const opFilter = ref('to_ship')
const opOrders = computed(() => [...store.shipments].sort((a, b) => b.ts - a.ts))
const visibleOpOrders = computed(() =>
  opFilter.value === 'all' ? opOrders.value : opOrders.value.filter((o) => o.status === opFilter.value))
const opCountOf = (key) => opOrders.value.filter((o) => o.status === key).length

const shipForms = reactive({})
const ensureShipForm = (o) => {
  if (!shipForms[o.id]) shipForms[o.id] = { carrier: '', trackingNo: '', note: '' }
  return shipForms[o.id]
}
function doShip(o) {
  const form = ensureShipForm(o)
  if (store.shipShipment(o.id, form)) {
    shipForms[o.id] = { carrier: '', trackingNo: '', note: '' }
  }
}
</script>

<style scoped>
.ship-view { display: flex; flex-direction: column; gap: 16px; max-width: 1000px; margin: 0 auto; }

.ship-hero {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: linear-gradient(135deg, #123a4a, #162b55);
  border: 1px solid rgba(77,182,172,0.3); border-radius: 14px; padding: 18px 22px; flex-wrap: wrap;
}
.hero-stats { display: flex; gap: 28px; flex-wrap: wrap; }
.hs-item { display: flex; flex-direction: column; }
.hs-num { font-size: 26px; font-weight: 800; line-height: 1; }
.hs-num.warn { color: #ffb74d; }
.hs-num.info { color: #82b1ff; }
.hs-num.ok { color: #7ef0c9; }
.hs-num.muted { color: #b0bec5; }
.hs-lab { font-size: 11px; color: #9db0d0; margin-top: 5px; }

.role-box { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.role-tip { font-size: 11px; color: #9db0d0; }
.role-switch { display: flex; background: rgba(0,0,0,0.25); border-radius: 10px; padding: 3px; }
.role-switch button {
  background: transparent; border: none; color: #aebadd; font-size: 12px;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
}
.role-switch button.active {
  background: linear-gradient(135deg,#00897b,#2962ff); color: #fff;
  box-shadow: 0 3px 8px rgba(0,137,123,0.4);
}

.card {
  background: #0f1b38; border: 1px solid rgba(120,160,220,0.16);
  border-radius: 14px; padding: 16px;
}
.card-title {
  font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 14px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.filters { display: flex; gap: 5px; margin-left: auto; flex-wrap: wrap; }
.filters button {
  background: #13233f; border: 1px solid rgba(120,160,220,0.18); color: #8ba2c8;
  font-size: 11px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
}
.filters button.active { background: #00897b; color: #fff; border-color: transparent; }
.filters em { font-style: normal; opacity: 0.8; }

.todo-entry {
  background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.35);
  border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #ffcc80; margin-bottom: 12px;
}
.todo-entry b { color: #ffb74d; }

.empty { color: #5b6f94; text-align: center; padding: 24px; font-size: 12px; }

.ship-order {
  background: rgba(20,34,66,0.5); border: 1px solid rgba(120,160,220,0.14);
  border-left-width: 3px; border-radius: 10px; padding: 13px 14px; margin-bottom: 10px;
}
.ship-order.pending_address { border-left-color: #ff9800; }
.ship-order.to_ship { border-left-color: #42a5f5; }
.ship-order.shipped { border-left-color: #4caf50; }
.ship-order.received { border-left-color: #78909c; }

.o-head { display: flex; align-items: center; gap: 10px; }
.o-icon { font-size: 24px; }
.o-main { flex: 1; min-width: 0; }
.o-title { font-size: 13px; color: #eef3fc; font-weight: 700; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.o-src { font-size: 10px; color: #8ba2c8; font-weight: 400; }
.o-sub { font-size: 10px; color: #6f84ab; margin-top: 2px; }
.o-status { font-size: 11px; padding: 3px 10px; border-radius: 6px; font-weight: 600; flex-shrink: 0; }
.o-status.pending_address { background: rgba(255,152,0,0.18); color: #ffb74d; }
.o-status.to_ship { background: rgba(66,165,245,0.18); color: #82b1ff; }
.o-status.shipped { background: rgba(76,175,80,0.18); color: #7ef0c9; }
.o-status.received { background: rgba(144,164,174,0.18); color: #b0bec5; }

/* 地址表单 */
.addr-form {
  margin-top: 11px; display: flex; flex-direction: column; gap: 8px;
  background: rgba(255,152,0,0.05); border: 1px dashed rgba(255,152,0,0.3);
  border-radius: 9px; padding: 11px;
}
.af-row { display: flex; gap: 8px; }
.addr-form input {
  flex: 1; background: #0c1730; border: 1px solid rgba(120,160,220,0.2); color: #dbe4f3;
  border-radius: 8px; padding: 8px 11px; font-size: 12px;
}
.af-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn-primary {
  align-self: flex-end;
  background: linear-gradient(135deg,#66bb6a,#43a047); color: #fff; border: none;
  border-radius: 8px; padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.btn-primary:hover { filter: brightness(1.08); }
.btn-ghost {
  background: transparent; border: 1px solid rgba(120,160,220,0.35); color: #aebadd;
  border-radius: 8px; padding: 7px 14px; font-size: 12px; cursor: pointer; white-space: nowrap;
}

.addr-box, .ship-box, .done-box {
  margin-top: 11px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border-radius: 9px; padding: 10px 12px;
}
.addr-box { background: rgba(66,165,245,0.08); border: 1px solid rgba(66,165,245,0.25); }
.ship-box { background: rgba(76,175,80,0.08); border: 1px solid rgba(76,175,80,0.25); }
.done-box { background: rgba(144,164,174,0.08); border: 1px solid rgba(144,164,174,0.22); }
.ab-info { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #dbe4f3; }
.ab-info b { color: #eef3fc; }
.ab-info span { color: #aebadd; }
.ab-info em { font-style: normal; font-size: 10px; color: #7e97c2; }

.op-hint { font-size: 11px; color: #6f84ab; margin: 0 0 12px; }
.op-wait {
  margin-top: 10px; font-size: 12px; color: #b0bcd4;
  background: rgba(120,160,220,0.07); border-radius: 8px; padding: 9px 12px;
}
.op-ship {
  margin-top: 11px; display: flex; flex-direction: column; gap: 10px;
  background: rgba(66,165,245,0.06); border: 1px solid rgba(66,165,245,0.22);
  border-radius: 9px; padding: 11px;
}
.receiver-info { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: #dbe4f3; }
.receiver-info b { color: #eef3fc; }
.receiver-info span { color: #aebadd; }
.receiver-info em { font-style: normal; font-size: 10px; color: #7e97c2; }
.ship-form { display: flex; flex-direction: column; gap: 8px; }
.sf-row { display: flex; gap: 8px; }
.ship-form select, .ship-form input {
  flex: 1; background: #0c1730; border: 1px solid rgba(120,160,220,0.2); color: #dbe4f3;
  border-radius: 8px; padding: 8px 11px; font-size: 12px; font-family: inherit;
}
.ship-form .btn-primary { flex: 0 0 auto; }
.ship-box.op { margin-top: 11px; }
</style>
