import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button } from './components.js';
import { RelicList } from './relicPanel.js';
import { t } from '../../../shared/i18n.js';

/** Presentation only: the server draws and grants before publishing this result. */
export function AscensionLottery({ reward, round }) {
  const [dismissed, setDismissed] = useState(false);
  if (!reward || round !== reward.round || dismissed) return null;
  return html`<${Modal} open=${true} title=${t('超限模拟 · 第 4 回合抽奖')} micro="ASCENSION LOTTERY"
    width="min(9rem, 94vw)" tone="gold" class="ascension-lottery" onClose=${() => setDismissed(true)}
    actions=${html`<${Button} onClick=${() => setDismissed(true)}>${t('确认')}<//>`}>
    <p class="relic-panel__rule">${t('四类奖品各有 25% 概率：15 金币、2 名最高层数盟约的随机干员、2 件随机收藏品、恢复 8 点目标生命值。')}</p>
    <p role="status"><b>${t('本次抽中：{text}', { text: reward.text })}</b></p>
    ${reward.kind === 'relics' ? html`<${RelicList} relics=${reward.ids.map((id) => ({ id, round: reward.round }))} illustrated=${true} />` : null}
    <p class="relic-panel__note">${t('奖励已自动发放。盟约层数并列最高时随机选取一个盟约；收藏品沿用第 4 回合掉落池，同名不重复。')}</p>
  <//>`;
}
