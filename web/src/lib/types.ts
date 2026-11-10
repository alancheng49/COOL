export type Role = 'admin' | 'student';

export type QuizKind = 'exam' | 'homework';

export interface Session {
  token: string;
  account: string;
  display_name: string;
  role: string;
  quizzes: QuizInfo[];
  expires_at?: string;
}

export interface QuizInfo {
  id: string;
  name: string;
  file: string;
  version: number;
  time_limit_minutes: number;
  available_at?: string | null;
  due_at?: string | null;
  attempt_limit?: number | null;
  pdf_mode?: boolean;
  pdf_url?: string;
  description?: string;
  topic?: string;
  kind?: QuizKind;
}

export interface AnswerImage {
  url: string;
  path: string;
  size: number;
}

export interface SubQuestion {
  question_type?: 'choice' | 'cloze' | 'multi' | 'short_answer';
  content?: string; // 小題敘述
  question_content?: string;
  question_image?: string;
  points?: number; // 小題配分
  options?: string[];
  option_images?: (string | null)[];
  answer?: string;
  correct_answer_indices?: number[];
  cloze_template?: string;
  cloze_options?: string[][];
  cloze_answer_indices?: number[]; // 發題時伺服器會剝除
}

/** Coordinates are fractions of the displayed PDF page, independent of zoom/device. */
export interface PdfRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Question {
  pdf_region?: PdfRegion;
  question_type: 'choice' | 'cloze' | 'multi' | 'short_answer' | 'group';
  points?: number; // 作答頁顯示用；舊題目由開始作答 API 補齊
  display_type?: 'text' | 'image';
  question_content?: string;
  question_image?: string;
  options?: string[];
  option_images?: (string | null)[];
  answer?: string;
  correct_answer_indices?: number[]; // multi 題正解（發題時伺服器會剝除）
  cloze_template?: string;
  cloze_options?: string[][];
  cloze_answer_indices?: number[];
  sub_questions?: SubQuestion[]; // 填充題小題（新格式）
  group_questions?: SubQuestion[]; // 題組：每個小題可使用不同題型
}

export interface ShortAnswerValue {
  text: string;
  images: AnswerImage[];
}

export interface GroupAnswerValue {
  parts: UserAnswer[];
}

// 舊題型沿用 number/陣列；新題型使用具名物件，避免與舊格式混淆。
export type UserAnswer = number | (number | undefined)[] | (number | undefined)[][] | ShortAnswerValue | GroupAnswerValue | undefined;

export interface ServerPartAnswer {
  selected_index?: number | null;
  selected_indices?: (number | null)[];
  short_text?: string;
  short_images?: AnswerImage[];
}

export interface ServerAnswer {
  q_index: number;
  selected_index?: number;
  selected_indices?: (number | null)[];
  sub_answers?: (number | null)[][]; // cloze 小題制
  short_text?: string;
  short_images?: AnswerImage[];
  group_answers?: ServerPartAnswer[];
}

export interface KeySub {
  type?: string;
  points: number;
  correct_indices: number[];
  earned?: number;
  correct?: boolean;
  correct_index?: number;
  option_count?: number;
  feedback?: string;
  pending?: boolean;
}

export interface KeyInfo {
  q_index: number;
  type: string;
  points: number;
  correct?: boolean;
  earned?: number;
  correct_index?: number;
  correct_indices?: number[];
  option_count?: number; // multi 題選項數
  subs?: KeySub[]; // cloze 小題制
  explanation?: string; // 詳解(Markdown + LaTeX,選填)
  grading_status?: 'pending' | 'graded';
  feedback?: string;
}

export interface AttemptItem {
  attempt_id: string;
  account?: string;
  display_name?: string;
  quiz_id: string;
  quiz_version: number;
  score: number | null;
  max_score: number;
  server_received_at: string;
  duration_sec?: number | null;
  grading_status?: 'pending' | 'graded';
}

export interface BestItem {
  quiz_id: string;
  quiz_version: number;
  title: string;
  file: string;
  best_score: number;
  best_max: number;
  attempt_id: string;
  updated_at: string;
}

export interface AdminQuizItem {
  quiz_id: string;
  quiz_version: number;
  title: string;
  file: string;
  time_limit_minutes: number | null;
  total_points: number;
  is_active: boolean;
  assigned_count: number;
  assigned_accounts?: string[];
  scheduled_count?: number;
  topic?: string;
  kind?: QuizKind;
}

export interface AdminQuizDraft {
  draft_id: string;
  quiz_id: string;
  quiz_version: number;
  source_quiz_id: string;
  source_quiz_version: number;
  title: string;
  topic?: string;
  description?: string;
  file: string;
  source_file?: string;
  time_limit_value: string;
  total_points: number;
  score_helper_total?: string;
  kind?: QuizKind;
  is_active: boolean;
  pdf_mode?: boolean;
  pdf_url?: string;
  pdf_path?: string;
  created_at?: string;
  updated_at: string;
}

export interface UserItem {
  account: string;
  display_name: string;
  role: string;
  is_active: boolean;
  note?: string; // 老師備註,學生不可見
}

export interface TagDef {
  name: string;
  color: string;
}

export interface PostAttachment {
  name: string;
  path: string;
  url: string;
  size: number;
}

export interface PostItem {
  id: string;
  author: string;
  published: boolean;
  title: string;
  content: string;
  tags: string[];
  attachments: PostAttachment[];
  audience: 'all' | 'selected';
  accounts: string[];
  created_at: string;
  updated_at: string;
}

export type ImageUploadDecision = 'check' | 'reuse' | 'keep_both' | 'replace';

export interface ImageReferenceItem {
  type: 'quiz' | 'draft';
  label: string;
  count: number;
}

export interface ImageUploadCandidate {
  path: string;
  original_name: string;
  size: number;
  content_type: string;
  created_at: string;
  same_content: boolean;
  same_name: boolean;
  reference_count: number;
  references: ImageReferenceItem[];
}

export interface ImageUploadResponse {
  ok?: boolean;
  error?: string;
  path?: string;
  size?: number;
  sha256?: string;
  reused?: boolean;
  duplicate_kept?: boolean;
  requires_choice?: boolean;
  collision_type?: 'same_content' | 'same_name';
  candidates?: ImageUploadCandidate[];
  replaced?: { references: number; documents: number };
}
