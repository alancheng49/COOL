import { useEffect, useMemo, useRef, useState } from 'react';
import { adminDeleteQuizDraft, adminListQuizzes, adminQuizDetail, adminQuizDraftDetail, adminRenameQuiz, adminUpsertQuizDraft, uploadPdf, upsertAnswerKeys, upsertQuestions, upsertQuiz } from '@/lib/api';
import type { AdminQuizDraft, AdminQuizItem, Question } from '@/lib/types';
import MathHtml from '@/components/MathHtml';
import MarkdownMath from '@/components/MarkdownMath';
import ImageField from '@/components/ImageField';
import PdfViewer from '@/components/PdfViewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Trash2, ArrowUp, ArrowDown, Eye, FileUp, PanelRight, Sigma, Calculator, Save, Send, ListOrdered } from 'lucide-react';
import MathInputDialog from '@/components/MathInputDialog';
import PointsInput from '@/components/PointsInput';
import QuestionOutline from '@/components/QuestionOutline';

import { type EditQ, type EditPart, type EditSub, type EditBlank, emptyChoice, emptyMulti, emptyBlank, isNumberBlank, blankProblem, emptySub, emptyCloze, emptyShort, emptyPart, emptyGroup, normalizeDraftQuestion, splitPoints, setQuestionPoints, scaleQuestionPoints, changeQuestionType, changePartType, questionTypeChangeDropsContent, partTypeChangeDropsContent, QUESTION_TYPES, QUESTION_TYPE_LABELS, fromQuestion, toQuestion } from '@/lib/quiz-editor';

export default function AdminEditor({ routeKey }: { routeKey: string }) {
  // /admin/editor、/admin/editor/:quiz_id/:version 或 /admin/editor/draft/:draft_id
  const parts = routeKey.split('/');
  const isDraftRoute = parts[3] === 'draft' && !!parts[4];
  const editDraftId = isDraftRoute ? decodeURIComponent(parts[4]) : '';
  const editQuizId = !isDraftRoute && parts[3] ? decodeURIComponent(parts[3]) : '';
  const editVersion = !isDraftRoute && parts[4] ? Number(parts[4]) : 0;
  const isEdit = !!editQuizId || !!editDraftId;

  const [draftId, setDraftId] = useState(editDraftId);
  const [quizId, setQuizId] = useState('');
  const [sourceQuizId, setSourceQuizId] = useState(editQuizId);
  const [sourceQuizVersion, setSourceQuizVersion] = useState(editVersion || 1);
  const [version, setVersion] = useState('1');
  const [topic, setTopic] = useState('');
  const [topicMode, setTopicMode] = useState<'existing' | 'new'>('existing');
  const [existingTopics, setExistingTopics] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState('');
  const [sourceFile, setSourceFile] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [active, setActive] = useState(true);
  const [pdfMode, setPdfMode] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfPath, setPdfPath] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showPdf, setShowPdf] = useState(false); // 編輯時側邊顯示題本
  const [pdfQuestion, setPdfQuestion] = useState(0);
  const pdfPanelRef = useRef<HTMLDivElement>(null);
  const [qs, setQs] = useState<EditQ[]>([]);
  const [scoreHelperTotal, setScoreHelperTotal] = useState('100');
  const [scoreHelperMsg, setScoreHelperMsg] = useState('');
  const [unifyType, setUnifyType] = useState<EditQ['question_type']>('choice');
  const [unifyPoints, setUnifyPoints] = useState('');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busyAction, setBusyAction] = useState<'draft' | 'publish' | ''>('');
  const [loading, setLoading] = useState(isEdit);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    void adminListQuizzes().then((response) => {
      if (!response?.ok) return;
      const topics = (response.items || [])
        .map((quiz: AdminQuizItem) => quiz.topic?.trim() || '')
        .concat((response.drafts || []).map((draft: AdminQuizDraft) => draft.topic?.trim() || ''))
        .filter(Boolean);
      setExistingTopics([...new Set<string>(topics)].sort((a, b) => a.localeCompare(b, 'zh-TW')));
    });
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    if (isDraftRoute) {
      adminQuizDraftDetail(editDraftId).then((d) => {
        if (d?.ok) {
          const draft = d.draft;
          setDraftId(draft.draft_id);
          setQuizId(draft.quiz_id);
          setSourceQuizId(draft.source_quiz_id || '');
          setSourceQuizVersion(Number(draft.source_quiz_version || 1));
          setVersion(String(draft.quiz_version || 1));
          setTopic(draft.topic || '');
          setTitle(draft.title || '');
          setDescription(draft.description || '');
          setFile(draft.file || '');
          setSourceFile(draft.source_file || '');
          setTimeLimit(draft.time_limit_value || '');
          setActive(!!draft.is_active);
          setPdfMode(!!draft.pdf_mode);
          setPdfUrl(draft.pdf_url || '');
          setPdfPath(draft.pdf_path || '');
          setScoreHelperTotal(draft.score_helper_total || (Number(draft.total_points) > 0 ? String(draft.total_points) : '100'));
          setShowPdf(!!draft.pdf_mode && !!draft.pdf_url);
          setQs((Array.isArray(draft.editor) ? draft.editor : []).map((question: Partial<EditQ>) => normalizeDraftQuestion(question)));
        } else {
          setMsg(`草稿載入失敗：${d?.error || '未知錯誤'}`);
        }
        setLoading(false);
      });
      return;
    }
    adminQuizDetail(editQuizId, editVersion).then((d) => {
      if (d?.ok) {
        setQuizId(d.meta.quiz_id);
        setSourceQuizId(d.meta.quiz_id);
        setSourceQuizVersion(Number(d.meta.quiz_version));
        setVersion(String(d.meta.quiz_version));
        setTopic(d.meta.topic || '');
        setTitle(d.meta.title);
        setDescription(d.meta.description || '');
        setFile(d.meta.file);
        setSourceFile(d.meta.file || '');
        setTimeLimit(d.meta.time_limit_minutes ? String(d.meta.time_limit_minutes) : '');
        setActive(d.meta.is_active);
        setPdfMode(!!d.meta.pdf_mode);
        setPdfUrl(d.meta.pdf_url || '');
        setPdfPath(d.meta.pdf_path || '');
        if (Number(d.meta.total_points) > 0) setScoreHelperTotal(String(d.meta.total_points));
        if (d.meta.pdf_mode && d.meta.pdf_url) setShowPdf(true);
        const keyByIdx: Record<number, { correct?: number; correct_indices?: number[]; points?: number; explanation?: string; subs?: { points: number; correct_indices: number[] }[] }> = {};
        (d.keys || []).forEach((k: { q_index: number; correct?: number; correct_indices?: number[]; points?: number; explanation?: string; subs?: { points: number; correct_indices: number[] }[] }) => (keyByIdx[k.q_index] = k));
        setQs(((d.questions as Question[]) || []).map((q, i) => fromQuestion(q, keyByIdx[i])));
      } else {
        setMsg(`載入失敗：${d?.error || '未知錯誤'}`);
      }
      setLoading(false);
    });
  }, [isEdit, isDraftRoute, editDraftId, editQuizId, editVersion]);

  const topicOptions = useMemo(() => {
    const values = topicMode === 'existing' && topic.trim() ? [...existingTopics, topic.trim()] : existingTopics;
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-TW'));
  }, [existingTopics, topic, topicMode]);

  const update = (i: number, patch: Partial<EditQ>) =>
    setQs((prev) => prev.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const moveQuestion = (from: number, to: number) => {
    if (from === to || to < 0 || to >= qs.length) return;
    setPdfQuestion((selected) => {
      if (selected === from) return to;
      if (from < selected && selected <= to) return selected - 1;
      if (to <= selected && selected < from) return selected + 1;
      return selected;
    });
    setQs((prev) => {
      const next = [...prev];
      const [question] = next.splice(from, 1);
      next.splice(to, 0, question);
      return next;
    });
  };
  const changePoints = (i: number, points: number) =>
    setQs((prev) => prev.map((q, k) => (k === i ? scaleQuestionPoints(q, points) : q)));
  const changeType = (i: number, type: EditQ['question_type']) => {
    if (questionTypeChangeDropsContent(qs[i], type) && !window.confirm('切換題型會清空此題已填的選項／小題內容，確定要切換嗎？')) return;
    setQs((prev) => prev.map((q, k) => (k === i ? changeQuestionType(q, type) : q)));
  };
  const jumpToQuestion = (i: number) => {
    setOutlineOpen(false);
    setPdfQuestion(i);
    document.getElementById(`question-${i}`)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  };

  const distributeQuizPoints = () => {
    const total = Number(scoreHelperTotal);
    if (!Number.isFinite(total) || total <= 0) {
      setScoreHelperMsg('請輸入大於 0 的總分。');
      return;
    }
    if (!qs.length) {
      setScoreHelperMsg('請先新增題目。');
      return;
    }
    if (Math.round(total * 100) < qs.length) {
      setScoreHelperMsg('總分過低，每題至少需要 0.01 分。');
      return;
    }
    const points = splitPoints(total, qs.length);
    setQs((current) => current.map((question, index) => setQuestionPoints(question, points[index])));
    setScoreHelperMsg(`已將 ${total} 分平均分配給 ${qs.length} 題。`);
  };

  const typeStats = useMemo(() => QUESTION_TYPES.map((type) => {
    const items = qs.filter((question) => question.question_type === type);
    return { type, count: items.length, points: Math.round(items.reduce((sum, question) => sum + Number(question.points || 0), 0) * 100) / 100 };
  }), [qs]);

  const unifyTypeQuizPoints = () => {
    const points = Math.round(Number(unifyPoints) * 100) / 100;
    if (!Number.isFinite(points) || points <= 0) {
      setScoreHelperMsg('請輸入大於 0 的每題配分。');
      return;
    }
    const count = qs.filter((question) => question.question_type === unifyType).length;
    if (!count) {
      setScoreHelperMsg(`目前沒有${QUESTION_TYPE_LABELS[unifyType]}題。`);
      return;
    }
    setQs((current) => current.map((question) => question.question_type === unifyType ? scaleQuestionPoints(question, points) : question));
    setScoreHelperMsg(`已將 ${count} 題${QUESTION_TYPE_LABELS[unifyType]}統一為每題 ${points} 分。`);
  };

  const problems = useMemo(() => {
    const errs: string[] = [];
    if (!quizId.trim()) errs.push('quiz_id 未填');
    if (!title.trim()) errs.push('標題未填');
    if (!qs.length) errs.push('至少需要一題');
    if (pdfMode && !pdfUrl) errs.push('PDF 模式需要先上傳題本 PDF');
    qs.forEach((q, i) => {
      if (q.question_type === 'choice') {
        if (pdfMode) {
          if (q.options.length < 2) errs.push(`第 ${i + 1} 題選項數不足`);
        } else {
          if (q.options.filter((o, index) => o.trim() || q.option_images[index]).length < 2) errs.push(`第 ${i + 1} 題選項不足`);
          if (!q.options[q.correct_index]?.trim() && !q.option_images[q.correct_index]) errs.push(`第 ${i + 1} 題正解選項是空的`);
        }
      } else if (q.question_type === 'multi') {
        if (pdfMode) {
          if (q.options.length < 2) errs.push(`第 ${i + 1} 題選項數不足`);
          if (!q.correct_multi.length) errs.push(`第 ${i + 1} 題（多選）至少要勾一個正解`);
        } else {
          if (q.options.filter((o, index) => o.trim() || q.option_images[index]).length < 2) errs.push(`第 ${i + 1} 題選項不足`);
          if (!q.correct_multi.length) errs.push(`第 ${i + 1} 題（多選）至少要勾一個正解`);
          if (q.correct_multi.some((ci) => !q.options[ci]?.trim() && !q.option_images[ci])) errs.push(`第 ${i + 1} 題有正解選項是空的`);
        }
      } else if (q.question_type === 'short_answer') {
        // 簡答題由老師人工批改，不需要預設正解。
      } else if (q.question_type === 'group') {
        if (!q.group_parts.length) errs.push(`第 ${i + 1} 題題組沒有小題`);
        q.group_parts.forEach((part, partIndex) => {
          if ((part.question_type === 'choice' || part.question_type === 'multi') && part.options.filter((option, index) => option.trim() || part.option_images[index]).length < 2) errs.push(`第 ${i + 1} 題（${partIndex + 1}）選項不足`);
          if (part.question_type === 'multi' && !part.correct_multi.length) errs.push(`第 ${i + 1} 題（${partIndex + 1}）至少要勾一個正解`);
          if (part.question_type === 'cloze' && !part.blanks.length) errs.push(`第 ${i + 1} 題（${partIndex + 1}）沒有填充格`);
          if (part.question_type === 'cloze') part.blanks.forEach((blank, blankIndex) => {
            const problem = blankProblem(blank);
            if (problem) errs.push(`第 ${i + 1} 題（${partIndex + 1}）第 ${blankIndex + 1} 格${problem}`);
          });
        });
        const partTotal = q.group_parts.reduce((sum, part) => sum + (Number(part.points) || 0), 0);
        if (Math.abs(partTotal - (Number(q.points) || 0)) > 1e-9) errs.push(`第 ${i + 1} 題小題配分加總（${partTotal}）不等於題組配分（${q.points}）`);
      } else if (!q.use_subs) {
        const sub = q.subs[0];
        if (!sub || !sub.blanks.length) errs.push(`第 ${i + 1} 題沒有任何填充格`);
        (sub?.blanks || []).forEach((b, bi) => {
          const problem = blankProblem(b);
          if (problem) errs.push(`第 ${i + 1} 題第 ${bi + 1} 格${problem}`);
        });
      } else {
        if (!q.subs.length) errs.push(`第 ${i + 1} 題沒有任何小題`);
        q.subs.forEach((sub, si) => {
          if (!sub.blanks.length) errs.push(`第 ${i + 1} 題（${si + 1}）沒有任何填充格`);
          sub.blanks.forEach((b, bi) => {
            const problem = blankProblem(b);
            if (problem) errs.push(`第 ${i + 1} 題（${si + 1}）第 ${bi + 1} 格${problem}`);
          });
        });
        const subTotal = q.subs.reduce((sum, sub) => sum + (Number(sub.points) || 0), 0);
        if (Math.abs(subTotal - (Number(q.points) || 0)) > 1e-9) {
          errs.push(`第 ${i + 1} 題小題配分加總（${subTotal}）不等於該題配分（${q.points}）`);
        }
      }
    });
    return errs;
  }, [quizId, title, qs, pdfMode, pdfUrl]);

  const saveDraftProgress = async () => {
    const nextQuizId = quizId.trim();
    const nextTitle = title.trim();
    if (!nextQuizId) {
      setMsg('儲存草稿前請先填寫考卷識別碼。');
      return;
    }
    if (!nextTitle) {
      setMsg('儲存草稿前請先填寫考卷標題。');
      return;
    }

    setBusyAction('draft');
    setMsg('');
    const result = await adminUpsertQuizDraft({
      draft_id: draftId || undefined,
      source_quiz_id: sourceQuizId,
      source_quiz_version: sourceQuizVersion,
      source_file: sourceFile,
      quiz_id: nextQuizId,
      quiz_version: Number(version) || 1,
      title: nextTitle,
      topic: topic.trim(),
      description,
      file,
      time_limit_value: timeLimit,
      total_points: qs.reduce((sum, question) => sum + (Number(question.points) || 0), 0),
      score_helper_total: scoreHelperTotal,
      is_active: active,
      pdf_mode: pdfMode,
      pdf_url: pdfUrl,
      pdf_path: pdfPath,
      editor_json: JSON.stringify(qs),
    });
    setBusyAction('');

    if (!result?.ok) {
      const errorMessage = result?.error === 'QUIZ_ID_EXISTS'
        ? '此識別碼已被其他正式考卷使用。'
        : result?.error === 'DRAFT_EXISTS'
          ? '此考卷已有另一份草稿，請從題目管理開啟該草稿。'
          : result?.error === 'DRAFT_TOO_LARGE'
            ? '草稿內容過大，請減少直接寫入題目的資料後再試。'
            : `草稿儲存失敗：${result?.error || '未知錯誤'}`;
      setMsg(errorMessage);
      return;
    }

    setDraftId(result.draft_id);
    setMsg('✅ 草稿已儲存，正式考卷尚未變更。');
    window.history.replaceState(null, '', `#/admin/editor/draft/${encodeURIComponent(result.draft_id)}`);
  };

  const publish = async () => {
    if (problems.length) {
      setMsg(`請先修正：${problems[0]}`);
      return;
    }
    setBusyAction('publish');
    setMsg('');
    let ver = Number(version) || 1;
    const nextQuizId = quizId.trim();
    const idChanged = !!sourceQuizId && sourceQuizId !== nextQuizId;
    const defaultFile = `questions/${nextQuizId}${ver === 1 ? '' : `_v${ver}`}.json`;
    const shouldForkQuestionFile = idChanged && file.trim() === sourceFile.trim();
    const fname = (shouldForkQuestionFile ? `questions/${nextQuizId}.json` : (file.trim() || defaultFile)).replace(/^\/+/, '');
    const finalFile = fname.endsWith('.json') ? fname : `${fname}.json`;
    const questionArr = qs.map(toQuestion);

    // 編輯時允許修改識別碼；後端會先同步搬移所有關聯資料。
    if (idChanged) {
      const renamed = await adminRenameQuiz(sourceQuizId, nextQuizId, sourceQuizVersion, 1);
      if (!renamed?.ok) {
        setBusyAction('');
        setMsg(renamed?.error === 'QUIZ_ID_EXISTS' ? '新的識別碼已被其他考卷使用' : `識別碼修改失敗：${renamed?.error || '未知錯誤'}`);
        return;
      }
      setSourceQuizId(nextQuizId);
      setSourceQuizVersion(1);
      ver = 1;
      setVersion('1');
    }

    // 1) 題目檔
    const r1 = await upsertQuestions(finalFile, JSON.stringify(questionArr, null, 2));
    if (!r1?.ok) { setBusyAction(''); setMsg(`題目檔上傳失敗：${r1?.error || '未知錯誤'}`); return; }
    // 2) Quiz meta
    const r2 = await upsertQuiz({
      pdf_mode: pdfMode, pdf_url: pdfMode ? pdfUrl : '', pdf_path: pdfMode ? pdfPath : '',
      quiz_id: quizId.trim(), quiz_version: ver, title: title.trim(),
      topic: topic.trim(),
      description: description.trim(),
      total_points: qs.reduce((s, q) => s + (q.points || 1), 0),
      is_active: active, file: finalFile,
      time_limit_minutes: timeLimit.trim() === '' ? null : Number(timeLimit),
    });
    if (!r2?.ok) { setBusyAction(''); setMsg(r2?.error === 'QUIZ_ID_EXISTS' ? '此識別碼已被其他考卷使用' : `Quiz Meta 上傳失敗：${r2?.error || '未知錯誤'}`); return; }
    // 3) Answer keys
    const keys = qs.map((q, i) => {
      if (q.question_type === 'short_answer') {
        return { q_index: i, question_type: 'short_answer', points: q.points || 1, explanation: q.explanation.trim() };
      }
      if (q.question_type === 'group') {
        return {
          q_index: i, question_type: 'group', points: q.points || 1, explanation: q.explanation.trim(),
          subs: q.group_parts.map((part) => ({
            type: part.question_type, points: part.points,
            ...(part.question_type === 'choice' ? { correct_index: part.correct_index } : {}),
            ...(part.question_type === 'multi' ? { correct_indices: [...part.correct_multi].sort((a, b) => a - b), option_count: part.options.length } : {}),
            ...(part.question_type === 'cloze' ? { correct_indices: part.blanks.map((blank) => blank.correct) } : {}),
          })),
        };
      }
      if (q.question_type === 'cloze') {
        if (!q.use_subs) {
          const sub = q.subs[0];
          return {
            q_index: i,
            question_type: 'cloze',
            correct_indices: (sub?.blanks || []).map((b) => b.correct),
            points: q.points || 1,
            explanation: q.explanation.trim(),
          };
        }
        return {
          q_index: i,
          question_type: 'cloze',
          subs: q.subs.map((sub) => ({ points: sub.points || 0, correct_indices: sub.blanks.map((b) => b.correct) })),
          points: q.subs.reduce((sum, sub) => sum + (sub.points || 0), 0),
          explanation: q.explanation.trim(),
        };
      }
      if (q.question_type === 'multi') {
        return {
          q_index: i,
          question_type: 'multi',
          correct_indices: [...q.correct_multi].sort((a, b) => a - b),
          option_count: q.options.length,
          points: q.points || 1,
          explanation: q.explanation.trim(),
        };
      }
      return { q_index: i, question_type: 'choice', correct_index: q.correct_index, points: q.points || 1, explanation: q.explanation.trim() };
    });
    const r3 = await upsertAnswerKeys(quizId.trim(), ver, keys);
    if (!r3?.ok) { setBusyAction(''); setMsg(`Answer Keys 上傳失敗：${r3?.error || '未知錯誤'}`); return; }

    if (draftId) {
      const deleted = await adminDeleteQuizDraft(draftId);
      if (!deleted?.ok && deleted?.error !== 'DRAFT_NOT_FOUND') {
        setBusyAction('');
        setMsg(`考卷已發佈，但草稿清除失敗：${deleted?.error || '未知錯誤'}`);
        return;
      }
    }

    setBusyAction('');
    setDraftId('');
    setSourceQuizId(nextQuizId);
    setSourceQuizVersion(ver);
    setMsg('✅ 已發佈，正式考卷內容已更新。');
    setFile(finalFile);
    setSourceFile(finalFile);
    window.history.replaceState(null, '', `#/admin/editor/${encodeURIComponent(nextQuizId)}/${ver}`);
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>;

  const pdfPanel = pdfMode && pdfUrl && showPdf;
  const editing = isEdit || !!draftId;
  const busy = !!busyAction;
  const outline = (className: string) => (
    <QuestionOutline className={className} questions={qs} onMove={moveQuestion} onPointsChange={changePoints} onJump={jumpToQuestion} />
  );

  return (
    <div className={pdfPanel ? 'mx-auto grid max-w-[1700px] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,42%)]' : 'mx-auto max-w-3xl xl:grid xl:max-w-6xl xl:grid-cols-[17rem_minmax(0,1fr)] xl:items-start xl:gap-5'}>
    {!pdfPanel && <aside className="hidden rounded-md border bg-card p-3 xl:sticky xl:top-20 xl:block">{outline('max-h-[calc(100vh-7rem)]')}</aside>}
    <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-bold">{draftId ? `編輯草稿：${title || quizId}` : editing ? `編輯：${title || editQuizId}` : '新增考卷'}</h2>
          <p className="text-sm text-muted-foreground">題目內容支援 LaTeX，用 $...$ 包住數學式。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
          <Eye className="mr-1 h-4 w-4" />{preview ? '關閉預覽' : '預覽'}
        </Button>
      </div>

      {/* Meta */}
      <Card className="mb-5">
        <CardContent className="grid grid-cols-1 gap-3 px-4 py-5 sm:grid-cols-2 sm:px-6 [&>*]:min-w-0">
          <div className="space-y-1">
            <Label>考卷識別碼（英數，不可重複）</Label>
            <Input value={quizId} onChange={(e) => setQuizId(e.target.value)} />
            {editing && Number(version) !== 1 && <p className="text-xs text-muted-foreground">此為舊資料 v{version}；修改識別碼後會在發佈時自動轉為新制的獨立考卷。</p>}
            {editing && sourceQuizId !== quizId.trim() && <p className="text-xs text-muted-foreground">發佈後會同步更新派遣、作答紀錄與提問，並將題目另存為新識別碼的獨立檔案。</p>}
          </div>
          <div className="space-y-1">
            <Label>主題／系列（選填）</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={topicMode === 'new' ? '__new_topic__' : topic}
              onChange={(event) => {
                if (event.target.value === '__new_topic__') {
                  setTopicMode('new');
                  setTopic('');
                } else {
                  setTopicMode('existing');
                  setTopic(event.target.value);
                }
              }}
            >
              <option value="">未分類</option>
              {topicOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              <option value="__new_topic__">+新增主題</option>
            </select>
            {topicMode === 'new' && <Input autoFocus value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="輸入新主題名稱" />}
          </div>
          <div className="space-y-1">
            <Label>標題（學生看到的名稱）</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>限時（分鐘，留空=不限時）</Label>
            <Input value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>題目檔名（留空自動用 questions/quiz_id.json)</Label>
            <Input value={file} onChange={(e) => setFile(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>作答前說明（選填，學生按「查看」後顯示，支援 Markdown 與 LaTeX）</Label>
            <Textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
            {preview && description.trim() && <MarkdownMath md={description} className="rounded bg-secondary/50 p-3 text-sm" />}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} />
            立即啟用（學生可作答）
          </label>
          <div className="space-y-2 sm:col-span-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={pdfMode} onCheckedChange={(v) => setPdfMode(!!v)} />
              PDF 模式（整份綁定）：設定每題的題型、正解、配分及 PDF 範圍，作答時自動定位到題目。未框選的題目仍可瀏覽整份題本。
            </label>
            {pdfMode && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pdfBusy}
                  onClick={() => document.getElementById('pdf-file-input')?.click()}
                >
                  <FileUp className="mr-1 h-4 w-4" />
                  {pdfBusy ? '上傳中…' : pdfUrl ? '重新上傳 PDF' : '上傳題本 PDF'}
                </Button>
                <input
                  id="pdf-file-input"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (f.size > 15 * 1024 * 1024) { setMsg('PDF 超過 15MB，請先壓縮'); return; }
                    setPdfBusy(true);
                    setMsg('');
                    try {
                      const b64 = await new Promise<string>((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result).split(',')[1]);
                        r.onerror = () => reject(new Error('讀檔失敗'));
                        r.readAsDataURL(f);
                      });
                      const res = await uploadPdf(b64);
                      if (res?.ok) {
                        setPdfUrl(res.url); setPdfPath(res.path); setShowPdf(true);
                        setQs((prev) => prev.map((q) => ({ ...q, pdf_region: undefined })));
                        setMsg('✅ PDF 已上傳，請為各題框選範圍；更換題本後需重新設定。');
                      }
                      else setMsg(`PDF 上傳失敗：${res?.error || '連線錯誤'}`);
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'PDF 上傳失敗');
                    } finally {
                      setPdfBusy(false);
                    }
                  }}
                />
                {pdfUrl && (
                  <>
                    <Button type="button" variant={showPdf ? 'default' : 'outline'} size="sm" onClick={() => setShowPdf((v) => !v)}>
                      <PanelRight className="mr-1 h-4 w-4" />
                      {showPdf ? '隱藏題本' : '顯示題本'}
                    </Button>
                    <a href={pdfUrl} target="_blank" rel="noopener" className="text-sm text-primary underline">
                      另開視窗
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mb-5 rounded-md border border-primary/30 bg-primary/[0.04] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-medium"><Calculator className="h-4 w-4 text-primary" />配分小幫手</div>
            <p className="mt-1 text-xs text-muted-foreground">
              目前配分合計 {Math.round(qs.reduce((sum, question) => sum + Number(question.points || 0), 0) * 100) / 100} 分
              {typeStats.filter((stat) => stat.count).map((stat) => ` · ${QUESTION_TYPE_LABELS[stat.type]} ${stat.count} 題 ${stat.points} 分`).join('')}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="score-helper-total">考卷總分</Label>
              <Input id="score-helper-total" type="number" min="0.01" step="0.01" className="w-28" value={scoreHelperTotal} onChange={(event) => { setScoreHelperTotal(event.target.value); setScoreHelperMsg(''); }} />
            </div>
            <Button type="button" variant="outline" onClick={distributeQuizPoints} disabled={!qs.length}>平分配分</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-end gap-2 border-t border-primary/15 pt-3">
          <div className="space-y-1">
            <Label htmlFor="score-unify-type">統一題型配分</Label>
            <select id="score-unify-type" className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={unifyType} onChange={(event) => { setUnifyType(event.target.value as EditQ['question_type']); setScoreHelperMsg(''); }}>
              {typeStats.map((stat) => <option key={stat.type} value={stat.type}>{QUESTION_TYPE_LABELS[stat.type]}（{stat.count} 題）</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="score-unify-points">每題配分</Label>
            <Input id="score-unify-points" type="number" min="0.01" step="0.01" className="w-28" value={unifyPoints} onChange={(event) => { setUnifyPoints(event.target.value); setScoreHelperMsg(''); }} />
          </div>
          <Button type="button" variant="outline" onClick={unifyTypeQuizPoints} disabled={!qs.length}>套用</Button>
        </div>
        {scoreHelperMsg && <p className={`mt-2 text-xs ${scoreHelperMsg.startsWith('已') ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>{scoreHelperMsg}</p>}
      </div>

      {/* 題目列表 */}
      <div className="space-y-4">
        {qs.map((q, i) => (
          <Card key={i} id={`question-${i}`} className="scroll-mt-20">
            <CardContent className="space-y-3 px-3 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-primary">第 {i + 1} 題</span>
                  <select aria-label={`第 ${i + 1} 題題型`} className="h-8 rounded-md border bg-card px-2 text-sm" value={q.question_type} onChange={(event) => changeType(i, event.target.value as EditQ['question_type'])}>
                    {QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
                    配分
                    <PointsInput className="h-7 w-14 text-center" label={`第 ${i + 1} 題配分`} value={q.points} onCommit={(points) => changePoints(i, points)} />
                  </span>
                  <MiniBtn onClick={() => moveQuestion(i, i - 1)}><ArrowUp className="h-4 w-4" /></MiniBtn>
                  <MiniBtn onClick={() => moveQuestion(i, i + 1)}><ArrowDown className="h-4 w-4" /></MiniBtn>
                  <MiniBtn danger onClick={() => { setQs((prev) => prev.filter((_, k) => k !== i)); setPdfQuestion((selected) => Math.max(0, selected >= i ? selected - 1 : selected)); }}><Trash2 className="h-4 w-4" /></MiniBtn>
                </div>
              </div>

              {pdfMode && <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary/50 p-3">
                <span className="text-sm">{q.pdf_region ? `已設定：PDF 第 ${q.pdf_region.page} 頁` : '尚未設定 PDF 題目範圍'}</span>
                <Button type="button" size="sm" variant="outline" disabled={!pdfUrl} onClick={() => {
                  setPdfQuestion(i); setShowPdf(true);
                  requestAnimationFrame(() => pdfPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
                }}>{q.pdf_region ? '查看／重畫範圍' : '設定題目範圍'}</Button>
                {q.pdf_region && <Button type="button" size="sm" variant="ghost" onClick={() => update(i, { pdf_region: undefined })}>清除範圍</Button>}
              </div>}
              {!pdfMode && (
                <>
                  <div className="space-y-1">
                    <Label>題幹</Label>
                    <MathTextField rows={2} value={q.question_content} onChange={(question_content) => update(i, { question_content })} />
                    {preview && q.question_content && <MathHtml html={q.question_content} className="rounded bg-secondary/50 px-3 py-2 text-sm" />}
                  </div>
                  <div className="space-y-1">
                    <Label>附圖（可留空）</Label>
                    <ImageField value={q.question_image} onChange={(path) => update(i, { question_image: path })} />
                  </div>
                </>
              )}
              {pdfMode && (q.question_type === 'choice' || q.question_type === 'multi') && (
                <p className="text-xs text-muted-foreground">
                  PDF 模式：選項只需標示字母，用「+ 選項 / 刪除」調整選項數，點字母設定正解，文字可留空。
                </p>
              )}

              {(q.question_type === 'choice' || q.question_type === 'multi') ? (
                <div className="space-y-2">
                  <Label>
                    {q.question_type === 'multi'
                      ? '選項（點左側方塊勾選正解，可多個）'
                      : '選項（點左側圓圈設為正解）'}
                  </Label>
                  {q.options.map((opt, k) => {
                    const isCorrect =
                      q.question_type === 'multi' ? q.correct_multi.includes(k) : q.correct_index === k;
                    return (
                      <div key={k} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (q.question_type === 'multi') {
                              const next = q.correct_multi.includes(k)
                                ? q.correct_multi.filter((x) => x !== k)
                                : [...q.correct_multi, k];
                              update(i, { correct_multi: next });
                            } else {
                              update(i, { correct_index: k });
                            }
                          }}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-bold ${q.question_type === 'multi' ? 'rounded' : 'rounded-full'} ${isCorrect ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/40 text-muted-foreground'}`}
                          title={q.question_type === 'multi' ? '勾選/取消正解' : '設為正解'}
                        >
                          {String.fromCharCode(65 + k)}
                        </button>
                        <MathTextField rows={1} value={opt} onChange={(value) => update(i, { options: q.options.map((o, x) => (x === k ? value : o)) })} />
                        <MiniBtn
                          danger
                          onClick={() =>
                            update(i, {
                              options: q.options.filter((_, x) => x !== k),
                              option_images: q.option_images.filter((_, x) => x !== k),
                              correct_index: Math.min(q.correct_index, q.options.length - 2),
                              correct_multi: q.correct_multi.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </MiniBtn>
                        <div className="col-start-2"><ImageField value={q.option_images[k] || ''} onChange={(path) => update(i, { option_images: q.options.map((_, x) => x === k ? path : (q.option_images[x] || '')) })} /></div>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => update(i, { options: [...q.options, ''], option_images: [...q.option_images, ''] })}>+ 選項</Button>
                  {preview && (
                    <div className="rounded bg-secondary/50 px-3 py-2 text-sm">
                      {q.options.map((o, k) => {
                        const isCorrect =
                          q.question_type === 'multi' ? q.correct_multi.includes(k) : k === q.correct_index;
                        return (
                          <div key={k} className={isCorrect ? 'font-bold text-emerald-700' : ''}>
                            <MathHtml html={`${String.fromCharCode(65 + k)}. ${o}`} />
                            {q.option_images[k] && <img src={q.option_images[k]} alt={`選項 ${String.fromCharCode(65 + k)}`} className="mt-1 max-h-32 object-contain" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : q.question_type === 'short_answer' ? (
                <div className="rounded-md border border-dashed bg-secondary/30 p-4 text-sm text-muted-foreground">學生可輸入 Markdown、LaTeX、使用數學輸入器或上傳圖片；交卷後等待老師批改。</div>
              ) : q.question_type === 'group' ? (
                <GroupEditor value={q.group_parts} totalPoints={q.points} onChange={(group_parts) => update(i, { group_parts })} />
              ) : (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={q.use_subs}
                      onCheckedChange={(v) => {
                        const on = !!v;
                        // 開啟小題時,把第一小題配分預設為該題配分,方便加總一致
                        update(i, {
                          use_subs: on,
                          subs: q.subs.length ? q.subs.map((x, y) => (y === 0 && on ? { ...x, points: x.points || q.points } : x)) : [emptySub()],
                        });
                      }}
                    />
                    使用小題（一題填充拆成多個小題，各自作答與配分）
                  </label>

                  {!q.use_subs ? (
                    (() => {
                      const sub = q.subs[0] || emptySub();
                      const setSub = (patch: Partial<EditSub>) =>
                        update(i, { subs: [{ ...sub, ...patch }, ...q.subs.slice(1)] });
                      return (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <Label>答案樣式（用 (1)、(2)… 表示空格）</Label>
                            <Textarea rows={1} value={sub.template} onChange={(e) => setSub({ template: e.target.value })} />
                            {preview && sub.template && <MathHtml html={sub.template} className="rounded bg-secondary/50 px-3 py-2 text-sm" />}
                          </div>
                          <Label>空格選項與正解（每格點選一個正解）</Label>
                          {sub.blanks.map((b, bi) => <BlankEditor key={bi} blank={b} index={bi} onChange={(blank) => setSub({ blanks: sub.blanks.map((x, y) => (y === bi ? blank : x)) })} onRemove={() => setSub({ blanks: sub.blanks.filter((_, y) => y !== bi) })} />)}
                          <Button variant="outline" size="sm" onClick={() => setSub({ blanks: [...sub.blanks, emptyBlank()] })}>
                            + 空格
                          </Button>
                        </div>
                      );
                    })()
                  ) : (
                  <>
                  <div className="flex items-center justify-between">
                    <Label>小題（大題敘述請填在上方題幹；配分加總須等於該題配分）</Label>
                    <span className="text-xs text-muted-foreground">
                      小題配分合計 {q.subs.reduce((sum, sub) => sum + (Number(sub.points) || 0), 0)} / 該題配分 {q.points}
                    </span>
                  </div>
                  {q.subs.map((sub, si) => {
                    const setSub = (patch: Partial<EditSub>) =>
                      update(i, { subs: q.subs.map((x, y) => (y === si ? { ...x, ...patch } : x)) });
                    return (
                      <div key={si} className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-serif text-sm font-bold text-primary">（{si + 1}）</span>
                          <div className="flex items-center gap-1">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              配分
                              <Input className="h-7 w-14 bg-card text-center" value={String(sub.points)} onChange={(e) => setSub({ points: Number(e.target.value) || 0 })} />
                            </span>
                            <MiniBtn danger onClick={() => update(i, { subs: q.subs.filter((_, y) => y !== si) })}><Trash2 className="h-3.5 w-3.5" /></MiniBtn>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">小題敘述（可留空）</Label>
                          <Textarea rows={1} className="bg-card" value={sub.content} onChange={(e) => setSub({ content: e.target.value })} />
                          {preview && sub.content && <MathHtml html={sub.content} className="rounded bg-card px-3 py-2 text-sm" />}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">答案樣式（用 (1)、(2)… 表示空格）</Label>
                          <Textarea rows={1} className="bg-card" value={sub.template} onChange={(e) => setSub({ template: e.target.value })} />
                          {preview && sub.template && <MathHtml html={sub.template} className="rounded bg-card px-3 py-2 text-sm" />}
                        </div>
                        <Label className="text-xs">空格選項與正解（每格點選一個正解）</Label>
                        {sub.blanks.map((b, bi) => <BlankEditor key={bi} blank={b} index={bi} onChange={(blank) => setSub({ blanks: sub.blanks.map((x, y) => (y === bi ? blank : x)) })} onRemove={() => setSub({ blanks: sub.blanks.filter((_, y) => y !== bi) })} />)}
                        <Button variant="outline" size="sm" onClick={() => setSub({ blanks: [...sub.blanks, emptyBlank()] })}>
                          + 空格
                        </Button>
                      </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => update(i, { subs: [...q.subs, emptySub()] })}>
                    + 小題
                  </Button>
                  </>
                  )}
                </div>
              )}

              {/* 詳解（選填） */}
              <div className="space-y-1 border-t border-border pt-3">
                <Label>詳解（選填，支援 Markdown 與 $LaTeX$，YouTube 影片用 @[youtube](網址) 單獨一行；學生只在交卷後與作答紀錄中看得到）</Label>
                <Textarea
                  rows={3}
                  value={q.explanation}
                  onChange={(e) => update(i, { explanation: e.target.value })}
                />
                {preview && q.explanation.trim() && (
                  <MarkdownMath md={q.explanation} className="rounded bg-secondary/50 px-3 py-2 text-sm" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="outline" onClick={() => setQs((prev) => [...prev, emptyChoice()])}>+ 單選題</Button>
        <Button variant="outline" onClick={() => setQs((prev) => [...prev, emptyMulti()])}>+ 多選題</Button>
        <Button variant="outline" onClick={() => setQs((prev) => [...prev, emptyCloze()])}>+ 填充題</Button>
        <Button variant="outline" onClick={() => setQs((prev) => [...prev, emptyShort()])}>+ 簡答題</Button>
        <Button variant="outline" onClick={() => setQs((prev) => [...prev, emptyGroup()])}>+ 題組</Button>
      </div>

      <div className="sticky bottom-0 z-20 mt-6 border-t border-border bg-background/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {problems.length > 0 && <p className="mb-2 max-h-20 overflow-y-auto text-xs text-amber-700 dark:text-amber-300">尚有問題：{problems.join(';')}</p>}
        {msg && <p className={`mb-2 text-sm ${msg.startsWith('✅') ? 'text-emerald-700' : 'text-destructive'}`}>{msg}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => (location.hash = '/admin')}>回題目管理</Button>
            <Button variant="outline" className={pdfPanel ? '' : 'xl:hidden'} onClick={() => setOutlineOpen(true)}>
              <ListOrdered className="mr-1.5 h-4 w-4" />題目清單
            </Button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button variant="outline" onClick={() => void saveDraftProgress()} disabled={busy}>
              <Save className="mr-1.5 h-4 w-4" />
              {busyAction === 'draft' ? '儲存中…' : '儲存草稿'}
            </Button>
            <Button onClick={() => void publish()} disabled={busy}>
              <Send className="mr-1.5 h-4 w-4" />
              {busyAction === 'publish' ? '發佈中…' : '發佈考卷'}
            </Button>
          </div>
        </div>
      </div>
    </div>

    {/* 題本側欄(編輯對照用) */}
    {pdfPanel && (
      <div ref={pdfPanelRef} className="order-first min-w-0 scroll-mt-20 xl:order-last xl:sticky xl:top-20">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Label htmlFor="pdf-question">框選題目</Label>
          <select id="pdf-question" className="min-h-10 rounded-md border bg-background px-2 text-sm" value={pdfQuestion} disabled={!qs.length} onChange={(e) => setPdfQuestion(Number(e.target.value))}>
            {!qs.length && <option value={0}>請先新增題目</option>}
            {qs.map((q, i) => <option key={i} value={i}>第 {i + 1} 題{q.pdf_region ? ` · 第 ${q.pdf_region.page} 頁` : ' · 未設定'}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">選題後，按「框選範圍」在題本上拖曳。範圍會隨草稿或考卷儲存。</span>
        </div>
        <PdfViewer url={pdfUrl} region={qs[pdfQuestion]?.pdf_region} focusKey={pdfQuestion}
          onRegionChange={qs[pdfQuestion] ? (region) => update(pdfQuestion, { pdf_region: region }) : undefined}
          className="h-[55vh] xl:h-[calc(100vh-11rem)]" />
      </div>
    )}
    <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-[min(24rem,92vw)] flex-col gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetTitle className="sr-only">題目清單</SheetTitle>
        {outline('min-h-0 flex-1')}
      </SheetContent>
    </Sheet>
    </div>
  );
}

function GroupEditor({ value, totalPoints, onChange }: { value: EditPart[]; totalPoints: number; onChange: (parts: EditPart[]) => void }) {
  const setPart = (index: number, patch: Partial<EditPart>) => onChange(value.map((part, i) => i === index ? { ...part, ...patch } : part));
  const distribute = () => {
    const points = splitPoints(Number(totalPoints) || 0, value.length);
    onChange(value.map((part, index) => ({ ...part, points: points[index] })));
  };
  const canDistribute = value.length > 0 && Math.round(Number(totalPoints) * 100) >= value.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>題組小題</Label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">配分合計 {Math.round(value.reduce((sum, part) => sum + Number(part.points || 0), 0) * 100) / 100} / 題組配分 {totalPoints}</span>
          <Button type="button" size="sm" variant="outline" onClick={distribute} disabled={!canDistribute} title={canDistribute ? '將題組配分平均分配給各小題' : '題組配分過低'}>平分配分</Button>
        </div>
      </div>
      {value.map((part, index) => (
        <div key={index} className="space-y-3 rounded-md border bg-secondary/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-sm font-bold text-primary">（{index + 1}）</span>
            <select className="h-8 rounded-md border bg-card px-2 text-sm" value={part.question_type} onChange={(event) => {
              const type = event.target.value as EditPart['question_type'];
              if (partTypeChangeDropsContent(part, type) && !window.confirm('切換題型會清空此小題已填的選項內容，確定要切換嗎？')) return;
              onChange(value.map((item, i) => i === index ? changePartType(item, type) : item));
            }}>
              <option value="choice">單選題</option><option value="multi">多選題</option><option value="cloze">填充題</option><option value="short_answer">簡答題</option>
            </select>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">配分<Input className="h-8 w-16 bg-card text-center" value={String(part.points)} onChange={(event) => setPart(index, { points: Number(event.target.value) || 0 })} /></span>
            <MiniBtn danger onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></MiniBtn>
          </div>
          <div className="space-y-1"><Label className="text-xs">小題題幹</Label><MathTextField rows={2} value={part.content} onChange={(content) => setPart(index, { content })} /></div>
          <div className="space-y-1"><Label className="text-xs">小題附圖（選填）</Label><ImageField value={part.image} onChange={(image) => setPart(index, { image })} /></div>
          {(part.question_type === 'choice' || part.question_type === 'multi') && (
            <div className="space-y-2">
              <Label className="text-xs">選項與正解</Label>
              {part.options.map((option, optionIndex) => {
                const correct = part.question_type === 'multi' ? part.correct_multi.includes(optionIndex) : part.correct_index === optionIndex;
                return <div key={optionIndex} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                  <button type="button" className={`flex h-7 w-7 items-center justify-center border text-xs font-bold ${part.question_type === 'multi' ? 'rounded' : 'rounded-full'} ${correct ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-card'}`} onClick={() => setPart(index, part.question_type === 'multi' ? { correct_multi: correct ? part.correct_multi.filter((i) => i !== optionIndex) : [...part.correct_multi, optionIndex] } : { correct_index: optionIndex })}>{String.fromCharCode(65 + optionIndex)}</button>
                  <MathTextField rows={1} value={option} onChange={(next) => setPart(index, { options: part.options.map((item, i) => i === optionIndex ? next : item) })} />
                  <MiniBtn danger onClick={() => setPart(index, { options: part.options.filter((_, i) => i !== optionIndex), option_images: part.option_images.filter((_, i) => i !== optionIndex), correct_multi: part.correct_multi.filter((i) => i !== optionIndex).map((i) => i > optionIndex ? i - 1 : i), correct_index: Math.max(0, Math.min(part.correct_index, part.options.length - 2)) })}><Trash2 className="h-4 w-4" /></MiniBtn>
                  <div className="col-start-2"><ImageField value={part.option_images[optionIndex] || ''} onChange={(image) => setPart(index, { option_images: part.options.map((_, i) => i === optionIndex ? image : (part.option_images[i] || '')) })} /></div>
                </div>;
              })}
              <Button size="sm" variant="outline" onClick={() => setPart(index, { options: [...part.options, ''], option_images: [...part.option_images, ''] })}>+ 選項</Button>
            </div>
          )}
          {part.question_type === 'cloze' && (
            <div className="space-y-2">
              <div className="space-y-1"><Label className="text-xs">答案樣式（用 (1)、(2)… 表示空格）</Label><MathTextField rows={1} value={part.template} onChange={(template) => setPart(index, { template })} /></div>
              <Label className="text-xs">空格選項與正解（每格點選一個正解）</Label>
              {part.blanks.map((blank, blankIndex) => <BlankEditor key={blankIndex} blank={blank} index={blankIndex} onChange={(next) => setPart(index, { blanks: part.blanks.map((item, i) => i === blankIndex ? next : item) })} onRemove={() => setPart(index, { blanks: part.blanks.filter((_, i) => i !== blankIndex) })} />)}
              <Button size="sm" variant="outline" onClick={() => setPart(index, { blanks: [...part.blanks, emptyBlank()] })}>+ 空格</Button>
            </div>
          )}
          {part.question_type === 'short_answer' && <p className="text-xs text-muted-foreground">學生可輸入文字、數學式或上傳圖片，需由老師人工批改。</p>}
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...value, emptyPart()])}>+ 小題</Button>
    </div>
  );
}

function BlankEditor({ blank, index, onChange, onRemove }: { blank: EditBlank; index: number; onChange: (blank: EditBlank) => void; onRemove: () => void }) {
  const custom = !isNumberBlank(blank);
  const switchMode = (mode: string) => {
    if (mode === 'custom') {
      onChange({ tokens: ['', ''], correct: 0 });
    } else if (!blank.tokens.some((token) => token.trim() !== '') || window.confirm('切換為數字會清空此格的自訂選項，確定要切換嗎？')) {
      onChange(emptyBlank());
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-8 shrink-0 text-sm font-semibold text-muted-foreground">({index + 1})</span>
        <select aria-label={`第 ${index + 1} 格選項類型`} className="h-8 shrink-0 rounded-md border bg-card px-2 text-sm" value={custom ? 'custom' : 'number'} onChange={(event) => switchMode(event.target.value)}>
          <option value="number">數字</option>
          <option value="custom">自訂選項</option>
        </select>
        <div className="flex min-w-0 flex-1 basis-40 flex-wrap gap-1.5">
          {blank.tokens.map((token, tokenIndex) => (
            <button
              key={tokenIndex}
              type="button"
              title="設為此格正解"
              onClick={() => onChange({ ...blank, correct: tokenIndex })}
              className={`min-w-8 max-w-full rounded border px-2 py-1 text-sm transition-colors ${blank.correct === tokenIndex ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border bg-card text-muted-foreground hover:border-emerald-500 hover:text-foreground'}`}
            >
              {token.trim() ? <MathHtml html={token} /> : `選項 ${tokenIndex + 1}`}
            </button>
          ))}
        </div>
        <MiniBtn danger onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></MiniBtn>
      </div>
      {custom && (
        <div className="space-y-2 pl-10">
          <p className="text-xs text-muted-foreground">選項支援 LaTeX，數學式用 $...$ 包住；上方按鈕會顯示渲染結果，點選即設為正解。</p>
          {blank.tokens.map((token, tokenIndex) => (
            <div key={tokenIndex} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <MathTextField rows={1} value={token} onChange={(value) => onChange({ ...blank, tokens: blank.tokens.map((item, i) => i === tokenIndex ? value : item) })} />
              <MiniBtn
                danger
                onClick={() => onChange({
                  tokens: blank.tokens.filter((_, i) => i !== tokenIndex),
                  correct: blank.correct === tokenIndex ? 0 : blank.correct > tokenIndex ? blank.correct - 1 : blank.correct,
                })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </MiniBtn>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...blank, tokens: [...blank.tokens, ''] })}>+ 選項</Button>
        </div>
      )}
    </div>
  );
}

function MathTextField({ value, onChange, rows }: { value: string; onChange: (value: string) => void; rows: number }) {
  const [showMath, setShowMath] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (snippet: string) => {
    const position = ref.current?.selectionStart ?? value.length;
    onChange(value.slice(0, position) + snippet + value.slice(position));
  };
  return <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row"><Textarea ref={ref} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /><Button type="button" variant="outline" size="icon" title="插入數學式" aria-label="插入數學式" className="shrink-0" onClick={() => setShowMath(true)}><Sigma className="h-4 w-4" /></Button>{showMath && <MathInputDialog onInsert={insert} onClose={() => setShowMath(false)} />}</div>;
}

function MiniBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded transition-colors md:h-7 md:w-7 ${danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-secondary'}`}
    >
      {children}
    </button>
  );
}
