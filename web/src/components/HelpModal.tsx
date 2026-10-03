import MathHtml from './MathHtml';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { backdropClose } from '@/lib/utils';

/** 作答說明（內容取自原 help.md，並更新為新系統行為） */
export default function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" {...backdropClose(onClose)}>
      <Card className="flex max-h-[90dvh] w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold">作答說明</h3>
            <Button variant="ghost" size="icon" aria-label="關閉作答說明" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-4 text-sm leading-relaxed">
            <section>
              <h4 className="mb-1 font-semibold text-primary">題型說明</h4>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><strong>單選題</strong>：就題目選出一個最佳選項。</li>
                <li>
                  <strong>多選題</strong>：可複選。採部分給分制，每答錯一個選項（多選或漏選）會扣分，
                  扣到 0 分為止；完全未作答則不計分。
                </li>
                <li>
                  <strong>填充題</strong>：採學測制度，依格子編號點選適當的數字或符號，
                  <strong>該題全對才有分</strong>。
                  <div className="mt-1.5 rounded bg-secondary/60 px-3 py-2">
                    <MathHtml html={'例：答案樣式為 $\\dfrac{(1)\\sqrt{(2)}}{(3)}$，正確答案是 $\\dfrac{-\\sqrt{2}}{7}$，則 (1) 選 $-$、(2) 選 $2$、(3) 選 $7$。'} highlightClozeBlanks />
                  </div>
                </li>
                <li><strong>簡答題</strong>：可輸入 Markdown、LaTeX、使用數學輸入器或上傳圖片；老師完成批改前不會公布分數與正解。</li>
                <li><strong>題組</strong>：依小題頁籤逐題作答，各小題可能使用不同題型。</li>
              </ul>
            </section>

            <section>
              <h4 className="mb-1 font-semibold text-primary">時間限制</h4>
              <p>
                有限時的測驗右上角會顯示倒數計時。計時從你<strong>第一次開始作答</strong>的那一刻起算，
                採絕對時間：即使中途離開或關閉分頁，<strong>時間仍持續倒數、不會暫停</strong>。
                時間到會使用最後一次自動儲存的內容交卷，即使當時已關閉分頁，也會在系統下一次處理紀錄時完成交卷。
              </p>
            </section>

            <section>
              <h4 className="mb-1 font-semibold text-primary">其他注意事項</h4>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>每份測驗可能設有作答次數上限與截止時間，超過將無法交卷。</li>
                <li>作答內容會自動儲存，中途離開再進入可以接續已選的答案，但計時不會暫停。</li>
                <li>按下交卷或系統在時間到自動交卷後，該次作答會計入次數。</li>
                <li>題目較長時，可能需要捲動頁面才能看到完整題目。</li>
              </ul>
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
