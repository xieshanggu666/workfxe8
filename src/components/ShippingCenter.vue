<template>
  <div class="ship-view">
    <!-- 顶部概览 + 角色切换 -->
    <div class="ship-hero">
      <div class="hero-stats">
        <template v-if="store.isOperator">
          <div class="hs-item">
            <span class="hs-num warn">{{ store.shippingStats.pendingShip + store.shippingStats.accepted }}</span>
            <span class="hs-lab">待运营处理</span>
          </div>
          <div class="hs-item">
            <span class="hs-num info">{{ store.shippingStats.pendingAddress }}</span>
            <span class="hs-lab">待用户填地址</span>
          </div>
          <div class="hs-item">
            <span class="hs-num ice">{{ store.shippingStats.shipped }}</span>
            <span class="hs-lab">已发货待收货</span>
          </div>
          <div class="hs-item">
            <span class="hs-num ok">{{ store.shippingStats.received }}</span>
            <span class="hs-lab">已完成履约</span>
          </div>
        </template>
        <template v-else>
          <div class="hs-item">
            <span class="hs-num warn">{{ myStats.pendingAddress }}</span>
            <span class="hs-lab">待填收货信息</span>
          </div>
          <div class="hs-item">
            <span class="hs-num info">{{ myStats.pendingShip + myStats.accepted }}</span>
            <span class="hs-lab">待运营发货</span>
          </div>
          <div class="hs-item">
            <span class="hs-num ice">{{ myStats.shipped }}</span>
            <span class="hs-lab">待确认收货</span>
          </div>
          <div class="hs-item">
            <span class="hs-num ok">{{ myStats.received }}</span>
            <span class="hs-lab">已完成</span>
          </div>
        </template>
      </div>
      <div class="role-box">
        <span class="role-tip">当前视角</span>
        <div class="role-switch">
          <button :class="{ active: store.role === 'user' }" @click="store.setRole('user')">👤 用户（收货）</button>
          <button :class="{ active: store.role === 'operator' }" @click="store.setRole('operator')">📦 运营（发货）</button>
        </div>
      </div>
    </div>

    <!-- 用户视角：中奖/兑换收货单 -->
    <template v-if="!store.isOperator">
      <div v-if="store.myShippingOrders.length === 0" class="card empty-card">
        <div class="empty-big">📭</div>
        <div>还没有需要收货的实物奖品/兑换记录</div>
        <div class="empty-sub">中奖实物或兑换实物商品后，可在此填写收货信息并跟踪物流</div>
      </div>

      <!-- 待办优先 -->
      <div v-for="grp in myGroups" :key="grp.key" class="card" v-show="grp.list.length">
        <div class="card-title">
          {{ grp.title }}
          <span class="grp-count">{{ grp.list.length }}</span>
        </div>
        <div v-for="o in grp.list" :key="o.id" class="order" :class="o.status">
          <div class="o-head">
            <span class="o-icon">{{ o.icon }}</span>
            <div class="o-main">
              <div class="o-title">
                {{ o.targetName }}
                <span class="o-src">{{ o.bizType === 'draw' ? '抽奖中奖 · ' + activityName(o) : '积分商城兑换' }}</span>
              </div>
              <div class="o-sub">单号 {{ o.id }} · {{ o.bizDate }} 获得</div>
            </div>
            <span class="o-status" :class="o.status">{{ statusMeta(o.status).label }}</span>
          </div>

          <!-- 进度条 -->
          <div class="steps">
            <span class="stp" :class="{ on: stepIndex(o.status) >= 0, done: stepIndex(o.status) > 0 }">① 填地址</span>
            <i class="stp-line" :class="{ on: stepIndex(o.status) >= 2 }"></i>
            <span class="stp" :class="{ on: stepIndex(o.status) >= 1, done: stepIndex(o.status) > 1 }">② 运营接单</span>
            <i class="stp-line" :class="{ on: stepIndex(o.status) >= 3 }"></i>
            <span class="stp" :class="{ on: stepIndex(o.status) >= 2, done: stepIndex(o.status) > 2 }">③ 发货</span>
            <i class="stp-line" :class="{ on: stepIndex(o.status) >= 4 }"></i>
            <span class="stp" :class="{ on: stepIndex(o.status) >= 3, done: stepIndex(o.status) > 3 }">④ 确认收货</span>
          </div>

          <!-- 填写收货信息 -->
          <div v-if="o.status === 'pending_address'" class="addr-form">
            <div class="af-row">
              <input v-model="addrDrafts[o.id].name" placeholder="收货人姓名" />
              <input v-model="addrDrafts[o.id].phone" placeholder="手机号（11 位）" maxlength="11" />
            </div>
            <div class="af-row">
              <input v-model="addrDrafts[o.id].region" placeholder="所在地区，如：上海市 浦东新区" />
            </div>
            <div class="af-row">
              <input v-model="addrDrafts[o.id].detail" placeholder="详细地址：街道、楼栋、门牌号" />
            </div>
            <div class="af-actions">
              <button class="btn-primary" @click="submitAddress(o)">📮 提交收货信息</button>
            </div>
          </div>

          <!-- 已填信息 + 物流 -->
          <div v-else class="addr-box">
            <div class="ab-line">
              <b>📍 {{ o.address.name }}</b> {{ o.address.phone }} · {{ o.address.region }} {{ o.address.detail }}
              <span class="ab-time">提交于 {{ o.addressAt }}</span>
            </div>
            <div v-if="o.status === 'pending_ship'" class="ab-note">⏳ 已提交，等待运营接单发货</div>
            <div v-else-if="o.status === 'accepted'" class="ab-note">📦 运营已接单，正在备货中</div>
            <template v-else-if="o.status === 'shipped'">
              <div class="track-box">
                <span class="tk-company">🚚 {{ o.expressCompany }}</span>
                <span class="tk-no">单号 {{ o.trackingNo }}</span>
                <span class="tk-time">发货于 {{ o.shippedAt }}</span>
              </div>
              <div class="af-actions">
                <button class="btn-receive" @click="store.confirmReceive(o.id)">✅ 确认收货</button>
              </div>
            </template>
            <template v-else-if="o.status === 'received'">
              <div class="track-box done">
                <span class="tk-company">🚚 {{ o.expressCompany }}</span>
                <span class="tk-no">单号 {{ o.trackingNo }}</span>
              </div>
              <div class="ab-note ok">🎉 已于 {{ o.receivedAt }} 确认收货，履约完成</div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- 运营视角：接单发货工作台 -->
    <template v-else>
      <div class="card">
        <div class="card-title">
          📦 收货履约单
          <div class="filters">
            <button v-for="f in opFilters" :key="f.key"
                    :class="{ active: opFilter === f.key }" @click="opFilter = f.key">
              {{ f.label }}
              <em v-if="f.key !== 'all'">({{ countOf(f.key) }})</em>
            </button>
          </div>
        </div>

        <div v-if="visibleOrders.length === 0" class="empty">暂无相关履约单</div>

        <div v-for="o in visibleOrders" :key="o.id" class="order op" :class="o.status">
          <div class="o-head">
            <span class="o-icon">{{ o.icon }}</span>
            <div class="o-main">
              <div class="o-title">
                {{ o.targetName }}
                <span class="o-src">{{ o.bizType === 'draw' ? '抽奖中奖 · ' + activityName(o) : '积分商城兑换' }}</span>
              </div>
              <div class="o-sub">
                单号 {{ o.id }} · 用户 {{ o.userName }}（{{ o.userId }}） · 业务日 {{ o.bizDate }}
              </div>
            </div>
            <span class="o-status" :class="o.status">{{ statusMeta(o.status).label }}</span>
          </div>

          <!-- 待用户填地址 -->
          <div v-if="o.status === 'pending_address'" class="op-note wait">
            ⏳ 等待用户填写收货信息，用户提交后自动进入待接单队列
          </div>

          <!-- 有地址：展示收货信息 -->
          <div v-if="o.address" class="addr-box op-box">
            <div class="ab-line">
              <b>📍 {{ o.address.name }}</b> {{ o.address.phone }} · {{ o.address.region }} {{ o.address.detail }}
              <span class="ab-time">用户提交于 {{ o.addressAt }}</span>
            </div>
          </div>

          <!-- 待接单 -->
          <div v-if="o.status === 'pending_ship'" class="op-actions">
            <button class="btn-accept" @click="store.acceptShipping(o.id)">🙋 接单（备货）</button>
            <span class="op-tip">或直接填写快递信息一键接单并发货 👇</span>
          </div>

          <!-- 发货表单：待接单/已接单均可 -->
          <div v-if="o.status === 'pending_ship' || o.status === 'accepted'" class="ship-form">
            <input v-model="shipDrafts[o.id].company" placeholder="快递公司，如：顺丰速运" />
            <input v-model="shipDrafts[o.id].trackingNo" placeholder="快递单号" />
            <button class="btn-ship" @click="submitShip(o)">
              🚚 {{ o.status === 'accepted' ? '确认发货' : '接单并发货' }}
            </button>
          </div>

          <!-- 已接单备注 -->
          <div v-if="o.status === 'accepted'" class="op-note">
            📦 已接单（{{ o.acceptedAt }}），发货后用户将收到待收货提醒
          </div>

          <!-- 已发货 -->
          <div v-if="o.status === 'shipped'" class="op-note transit">
            🚚 已发货：{{ o.expressCompany }} · 单号 {{ o.trackingNo }} · {{ o.shipper }} {{ o.shippedAt }} 处理，等待用户确认收货
          </div>
          <!-- 已完成 -->
          <div v-if="o.status === 'received'" class="op-note done">
            ✅ 用户已于 {{ o.receivedAt }} 确认收货，履约完成
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { usePlatformStore, SHIPPING_STATUS } from '@/store/platform'

const store = usePlatformStore()

const statusMeta = (s) => SHIPPING_STATUS[s] || { label: s, tone: '' }
const activityName = (o) => store.activities.find((a) => a.id === o.activityId)?.name || ''

// 履约进度（① 填地址 → ② 接单 → ③ 发货 → ④ 收货）
const STEP_OF = { pending_address: 0, pending_ship: 1, accepted: 2, shipped: 3, received: 4 }
const stepIndex = (s) => STEP_OF[s] ?? 0

// 用户地址草稿（每个待填单一份）
const ensureAddr = (o) => {
  if (!addrDrafts[o.id]) {
    addrDrafts[o.id] = {
      name: store.user.name === '运营测试用户' ? store.user.name : '',
      phone: '', region: '', detail: ''
    }
  }
}
const addrDrafts = reactive({})
store.myShippingOrders.filter((o) => o.status === 'pending_address').forEach(ensureAddr)

function submitAddress(o) {
  ensureAddr(o)
  if (store.fillShippingAddress(o.id, { ...addrDrafts[o.id] })) {
    addrDrafts[o.id] = { name: '', phone: '', region: '', detail: '' }
  }
}

// 运营发货草稿
const shipDrafts = reactive({})
const ensureShip = (o) => {
  if (!shipDrafts[o.id]) shipDrafts[o.id] = { company: o.expressCompany || '', trackingNo: o.trackingNo || '' }
}

// 收货单列表变化（新中奖/状态流转/角色切换）时惰性补齐草稿，避免模板 v-model 取到 undefined
watch(() => store.shippingOrders, (list) => {
  list.forEach((o) => {
    if (o.status === 'pending_address') ensureAddr(o)
    if (o.status === 'pending_ship' || o.status === 'accepted') ensureShip(o)
  })
}, { immediate: true, deep: false })

function submitShip(o) {
  ensureShip(o)
  if (store.shipOrder(o.id, { ...shipDrafts[o.id] })) {
    shipDrafts[o.id] = { company: '', trackingNo: '' }
  }
}

// 用户侧分组（待办在前）
const myGroups = computed(() => {
  const all = store.myShippingOrders
  const inTodo = (o) => ['pending_address', 'pending_ship', 'accepted', 'shipped'].includes(o.status)
  return [
    { key: 'todo', title: '🔔 待处理订单', list: all.filter(inTodo) },
    { key: 'done', title: '✅ 已完成订单', list: all.filter((o) => o.status === 'received') }
  ]
})

const myStats = computed(() => {
  const by = (st) => store.myShippingOrders.filter((o) => o.status === st).length
  return {
    pendingAddress: by('pending_address'),
    pendingShip: by('pending_ship'),
    accepted: by('accepted'),
    shipped: by('shipped'),
    received: by('received')
  }
})

// 运营侧过滤
const opFilters = [
  { key: 'todo', label: '待处理' },
  { key: 'all', label: '全部' },
  { key: 'pending_address', label: '待填地址' },
  { key: 'pending_ship', label: '待接单' },
  { key: 'accepted', label: '备货中' },
  { key: 'shipped', label: '待收货' },
  { key: 'received', label: '已完成' }
]
const opFilter = ref('todo')
// 'todo' 为运营默认聚合视图：待填地址 + 待接单 + 备货中 + 待收货
const visibleOrders = computed(() => {
  const list = store.shippingOrders.filter((o) =>
    opFilter.value === 'all' ? true
      : opFilter.value === 'todo' ? o.status !== 'received'
        : o.status === opFilter.value)
  return [...list].sort((a, b) => b.ts - a.ts)
})
const countOf = (key) => store.shippingOrders.filter((o) => o.status === key).length
</script>

<style scoped>
.ship-view { display: flex; flex-direction: column; gap: 16px; max-width: 1000px; margin: 0 auto; }

.ship-hero {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: linear-gradient(135deg, #14362e, #13304a);
  border: 1px solid rgba(77,182,172,0.3); border-radius: 14px; padding: 18px 22px; flex-wrap: wrap;
}
.hero-stats { display: flex; gap: 28px; flex-wrap: wrap; }
.hs-item { display: flex; flex-direction: column; }
.hs-num { font-size: 26px; font-weight: 800; line-height: 1; }
.hs-num.warn { color: #ffb74d; }
.hs-num.info { color: #82b1ff; }
.hs-num.ice { color: #81d4fa; }
.hs-num.ok { color: #7ef0c9; }
.hs-lab { font-size: 11px; color: #9db0d0; margin-top: 5px; }

.role-box { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.role-tip { font-size: 11px; color: #9db0d0; }
.role-switch { display: flex; background: rgba(0,0,0,0.25); border-radius: 10px; padding: 3px; }
.role-switch button {
  background: transparent; border: none; color: #aebadd; font-size: 12px;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
}
.role-switch button.active {
  background: linear-gradient(135deg,#00897b,#00695c); color: #fff;
  box-shadow: 0 3px 8px rgba(0,137,123,0.4);
}

.card {
  background: #0f1b38; border: 1px solid rgba(120,160,220,0.16);
  border-radius: 14px; padding: 16px;
}
.card-title {
  font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 14px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.grp-count {
  font-size: 11px; background: rgba(255,152,0,0.18); color: #ffb74d;
  padding: 1px 8px; border-radius: 8px; font-weight: 600;
}

.empty-card { text-align: center; padding: 48px 20px; color: #8ba2c8; }
.empty-big { font-size: 44px; margin-bottom: 10px; }
.empty-sub { font-size: 11px; color: #5b6f94; margin-top: 6px; }
.empty { color: #5b6f94; text-align: center; padding: 24px; font-size: 12px; }

.filters { display: flex; gap: 5px; margin-left: auto; flex-wrap: wrap; }
.filters button {
  background: #13233f; border: 1px solid rgba(120,160,220,0.18); color: #8ba2c8;
  font-size: 11px; padding: 5px 10px; border-radius: 7px; cursor: pointer;
}
.filters button.active { background: #00897b; color: #fff; border-color: transparent; }
.filters em { font-style: normal; opacity: 0.8; }

.order {
  background: rgba(20,34,66,0.5); border: 1px solid rgba(120,160,220,0.14);
  border-left-width: 3px; border-radius: 10px; padding: 13px 14px; margin-bottom: 10px;
}
.order.pending_address { border-left-color: #ff9800; }
.order.pending_ship { border-left-color: #42a5f5; }
.order.accepted { border-left-color: #5c6bc0; }
.order.shipped { border-left-color: #26c6da; }
.order.received { border-left-color: #4caf50; }
.o-head { display: flex; align-items: center; gap: 10px; }
.o-icon { font-size: 24px; }
.o-main { flex: 1; min-width: 0; }
.o-title { font-size: 13px; color: #eef3fc; font-weight: 700; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.o-src { font-size: 10px; color: #8ba2c8; font-weight: 400; }
.o-sub { font-size: 10px; color: #6f84ab; margin-top: 2px; }
.o-status { font-size: 11px; padding: 3px 10px; border-radius: 6px; font-weight: 600; flex-shrink: 0; }
.o-status.pending_address { background: rgba(255,152,0,0.18); color: #ffb74d; }
.o-status.pending_ship { background: rgba(66,165,245,0.18); color: #90caf9; }
.o-status.accepted { background: rgba(92,107,192,0.2); color: #9fa8da; }
.o-status.shipped { background: rgba(38,198,218,0.16); color: #80deea; }
.o-status.received { background: rgba(76,175,80,0.18); color: #7ef0c9; }

/* 履约步骤条 */
.steps { display: flex; align-items: center; gap: 6px; margin: 12px 0 4px; flex-wrap: wrap; }
.stp { font-size: 10px; color: #5b6f94; white-space: nowrap; }
.stp.on { color: #82b1ff; }
.stp.done { color: #7ef0c9; }
.stp-line { width: 26px; height: 2px; background: #243355; border-radius: 1px; }
.stp-line.on { background: #4db6ac; }

.addr-form { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.af-row { display: flex; gap: 8px; }
.af-row input { flex: 1; }
.addr-form input, .ship-form input {
  background: #0c1730; border: 1px solid rgba(120,160,220,0.2); color: #dbe4f3;
  border-radius: 8px; padding: 8px 11px; font-size: 12px; box-sizing: border-box; min-width: 0;
}
.af-actions { display: flex; justify-content: flex-end; margin-top: 2px; }

.addr-box {
  margin-top: 11px; background: rgba(41,98,255,0.07); border: 1px solid rgba(41,98,255,0.2);
  border-radius: 8px; padding: 9px 11px;
}
.addr-box.op-box { background: rgba(77,182,172,0.07); border-color: rgba(77,182,172,0.22); }
.ab-line { font-size: 12px; color: #c5d6f5; line-height: 1.5; }
.ab-time { display: block; font-size: 10px; color: #7e97c2; margin-top: 2px; }
.ab-note { font-size: 11px; color: #9db0d0; margin-top: 7px; }
.ab-note.ok { color: #7ef0c9; }

.track-box {
  margin-top: 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: rgba(38,198,218,0.08); border: 1px dashed rgba(38,198,218,0.35);
  border-radius: 8px; padding: 8px 11px; font-size: 12px;
}
.tk-company { color: #80deea; font-weight: 700; }
.tk-no { color: #b2ebf2; }
.tk-time { font-size: 10px; color: #7e97c2; margin-left: auto; }
.track-box.done { background: rgba(76,175,80,0.07); border-color: rgba(76,175,80,0.25); }

.op-note { margin-top: 10px; font-size: 11px; color: #9db0d0; }
.op-note.wait { color: #ffb74d; }
.op-note.transit { color: #80deea; }
.op-note.done { color: #7ef0c9; }
.op-actions { display: flex; align-items: center; gap: 10px; margin-top: 11px; }
.op-tip { font-size: 10px; color: #6f84ab; }

.ship-form { display: flex; gap: 8px; margin-top: 9px; }
.ship-form input:first-child { max-width: 150px; }
.ship-form input { flex: 1; }

button {
  border: none; border-radius: 8px; font-size: 12px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
}
.btn-primary {
  background: linear-gradient(135deg,#4d8dff,#2962ff); color: #fff;
  padding: 8px 18px;
}
.btn-receive {
  background: linear-gradient(135deg,#66bb6a,#43a047); color: #fff;
  padding: 8px 18px; margin-top: 10px;
}
.btn-accept {
  background: linear-gradient(135deg,#42a5f5,#1e88e5); color: #fff;
  padding: 8px 16px;
}
.btn-ship {
  background: linear-gradient(135deg,#26c6da,#00acc1); color: #fff;
  padding: 8px 16px;
}
</style>
