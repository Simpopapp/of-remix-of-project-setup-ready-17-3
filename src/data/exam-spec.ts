/**
 * Fonte única de verdade sobre o formato vigente do PTE Academic (22 tipos pontuados,
 * válido para provas realizadas a partir de 07/08/2025).
 *
 * Este módulo é dado puro: não importa nada e não contém lógica de aplicação. Motores de
 * prática (Fase 6), simulado (Fase 9) e pesos de estimativa (Fase 8) devem derivar daqui.
 *
 * Regras de honestidade embutidas:
 * - Toda afirmação numérica tem fonte e data de consulta em EXAM_SOURCES.
 * - Onde duas páginas oficiais divergem, a divergência está em `notes`/`weightsApproximation`.
 * - Nenhuma contagem do banco de questões aparece neste arquivo (isso é do manifesto).
 *
 * Documentos oficiais usados (consultados em 2026-10-20):
 * - Páginas de formato do PTE Academic (Pearson).
 * - PTE Academic Test Taker Score Guide (tabelas "No. of questions" e critérios por tarefa).
 * - Score Guide Institution, jul/2025 (matriz tarefa×habilidade e definições).
 * - Página oficial de atualizações de 2025 (mudanças válidas após 07/08/2025).
 */

export type ExamSection = "speaking" | "writing" | "reading" | "listening";
export type ExamSkill = ExamSection;

/**
 * Tempo de resposta por item.
 * - número: segundos fixos de resposta.
 * - "until_audio": a janela de resposta acompanha o item/áudio (sem valor fixo oficial).
 * - "shared_section": não há cronômetro por item; vale o tempo total da seção.
 */
export type ResponseWindow = number | "until_audio" | "shared_section";

export interface ExamTaskSpec {
  /** Id canônico do banco de questões (`src/data/bank/<tipo>.json`). */
  id: string;
  section: "speaking" | "writing" | "reading" | "listening";
  /** Nome oficial em inglês. */
  name: string;
  /** Nome amigável em pt-BR (interface). */
  namePt: string;
  /** Quantidade típica de tarefas deste tipo na prova (número ou faixa oficial). */
  scoredTasksInExam: number | [number, number];
  /** Segundos de preparação; ausente quando a tarefa não tem preparação. */
  preparationSeconds?: number;
  /** Segundos de resposta (ou janela especial). */
  responseSeconds?: ResponseWindow;
  /** Limite de conteúdo do item (texto, áudio, palavras). */
  contentLimit?: string;
  /** Habilidades pontuadas segundo a matriz oficial tarefa×habilidade. */
  scoredSkills: Array<"speaking" | "writing" | "reading" | "listening">;
  /** true quando a matriz oficial não é inequívoca para este tipo (aproximação declarada). */
  weightsApproximation?: boolean;
  /** Notas em pt-BR: divergências entre fontes, particularidades do tipo. */
  notes?: string;
}

export interface ExamBlueprintSection {
  section: string;
  tasks: Array<{ type: string; count: number }>;
  minutes: number;
}

export interface ExamBlueprint {
  id: "full-mock";
  totalMinutes: number;
  sections: ExamBlueprintSection[];
  sourceUrl: string;
  consultedAt: string;
  confirmed: boolean;
  notes?: string;
  /** Total de questões pontuadas do blueprint. */
  questionCount?: number;
  /** Faixa oficial de questões pontuadas do exame real. */
  questionCountRange?: [number, number];
  /** O que o simulado não reproduz fielmente (exibido ao aluno). */
  omissions?: readonly string[];
}

export interface ExamSource {
  /** Afirmação sustentada pela fonte, em pt-BR. */
  claim: string;
  sourceUrl: string;
  /** Data em que a fonte foi consultada (ISO `YYYY-MM-DD`). */
  consultedAt: string;
  status: "confirmed" | "approximation";
  /** Data de publicação/versão do documento, quando conhecida. */
  publishedAt?: string;
  note?: string;
}

/* --------------------------------------------------------------------------------------------- */
/* Fontes oficiais (URLs reutilizadas nas entradas de EXAM_SOURCES)                               */
/* --------------------------------------------------------------------------------------------- */

const URL_UPDATES_2025 = "https://www.pearsonpte.com/pte-updates-2025/";
const URL_CHANGES_2025 =
  "https://www.pearsonpte.com/articles/pte-changes-2025-everything-you-need-to-know/";
const URL_FORMAT_OVERVIEW = "https://www.pearsonpte.com/pte-academic/test-format/";
const URL_FORMAT_SPEAKING_WRITING =
  "https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/";
const URL_FORMAT_READING = "https://www.pearsonpte.com/pte-academic/test-format/reading/";
const URL_FORMAT_LISTENING = "https://www.pearsonpte.com/pte-academic/test-format/listening/";
const URL_SCORING = "https://www.pearsonpte.com/pte-academic/scoring/";
const URL_TEST_TAKER_SCORE_GUIDE =
  "https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/pte-academic-pdfs/PTE-Academic-Test-Taker-Score-Guide.pdf";
const URL_INSTITUTION_SCORE_GUIDE =
  "https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/Score-Guide-Institution-PTE-Academic-July-2025-web.pdf";

/** Data de consulta de todas as fontes desta spec. */
const CONSULTED_AT = "2026-10-20";

/* --------------------------------------------------------------------------------------------- */
/* Metadados do formato                                                                          */
/* --------------------------------------------------------------------------------------------- */

export const EXAM_META = {
  /** Mudanças de formato valem para provas realizadas a partir desta data. */
  formatEffectiveFrom: "2025-08-07",
  scoredTaskTypeCount: 22,
  /** Faixa oficial de questões pontuadas por prova (Score Guide). */
  totalScoredQuestions: [65, 75],
  /** Escala do score global e das habilidades comunicativas. */
  overallScoreScale: [10, 90],
  skillScoreScale: [10, 90],
  /** Duração declarada pela Pearson: aproximadamente 2 horas. */
  typicalDurationMinutesApprox: 120,
  /** Duração máxima declarada no glossário do Score Guide Institution (2h18). */
  maximumDurationMinutes: 138,
  /**
   * Partes do exame, na ordem oficial. As faixas de duração não somam o total:
   * a Pearson equilibra versões diferentes da prova. Nenhum candidato recebe
   * todos os mínimos ou todos os máximos ao mesmo tempo.
   */
  sections: [
    {
      id: "part-1",
      label: "Speaking & Writing",
      skills: ["speaking", "writing"],
      minutes: [76, 84],
      questionTypes: 9,
    },
    {
      id: "part-2",
      label: "Reading",
      skills: ["reading"],
      minutes: [23, 30],
      questionTypes: 5,
    },
    {
      id: "part-3",
      label: "Listening",
      skills: ["listening"],
      minutes: [31, 39],
      questionTypes: 8,
    },
  ],
  /**
   * Tipos com revisão humana adicional do critério Content (além do scoring por IA):
   * Describe Image, Re-tell Lecture, Respond to a Situation, Summarize Group Discussion,
   * Summarize Written Text, Write Essay e Summarize Spoken Text.
   */
  humanReviewedTypes: [
    "describe_image",
    "retell_lecture",
    "rts",
    "sgd",
    "swt",
    "write_essay",
    "sst",
  ],
} as const;

/** Ordem oficial das tarefas pontuadas dentro da prova. */
export const EXAM_TASK_ORDER: readonly string[] = [
  "read_aloud",
  "repeat_sentence",
  "describe_image",
  "retell_lecture",
  "answer_short",
  "sgd",
  "rts",
  "swt",
  "write_essay",
  "read_fib_dropdown",
  "read_mcq_multi",
  "reorder_paragraphs",
  "read_fib_drag",
  "read_mcq_single",
  "sst",
  "lst_mcq_multi",
  "lst_fib",
  "lst_hcs",
  "lst_mcq_single",
  "lst_smw",
  "lst_hiw",
  "wfd",
];

/**
 * Personal Introduction: aquecimento oral obrigatório, NÃO pontuado e fora dos 22 tipos.
 * Fica registado para fidelidade do fluxo, nunca entra no catálogo de treino pontuado.
 */
export const PERSONAL_INTRODUCTION = {
  id: "personal_introduction",
  name: "Personal Introduction",
  namePt: "Apresentação pessoal",
  scored: false,
  preparationSeconds: 25,
  responseSeconds: 30,
  notes:
    "Não pontua. Usada apenas para familiarizar o candidato com o microfone; não entra no catálogo dos 22 tipos nem no cálculo de estimativas.",
} as const;

/* --------------------------------------------------------------------------------------------- */
/* Catálogo dos 22 tipos pontuados                                                               */
/* --------------------------------------------------------------------------------------------- */

export const EXAM_TASKS: readonly ExamTaskSpec[] = [
  {
    id: "read_aloud",
    section: "speaking",
    name: "Read Aloud",
    namePt: "Ler em voz alta",
    scoredTasksInExam: [6, 7],
    preparationSeconds: 30,
    responseSeconds: "until_audio",
    contentLimit: "Texto de até 60 palavras",
    scoredSkills: ["speaking", "reading"],
    weightsApproximation: true,
    notes:
      "Preparação oficial de 30–40 s; adotado o mínimo. Divergência entre fontes oficiais: a página de formato diz que a tarefa afeta reading, speaking, pronunciation e oral fluency; a tabela do Score Guide (jul/2025) lista apenas Speaking. Adotada a união reading+speaking, marcada como aproximação até a Pearson publicar matriz inequívoca. O tempo de resposta acompanha o texto (barra de progresso), sem valor fixo oficial.",
  },
  {
    id: "repeat_sentence",
    section: "speaking",
    name: "Repeat Sentence",
    namePt: "Repetir a frase",
    scoredTasksInExam: [10, 12],
    responseSeconds: 15,
    contentLimit: "Áudio de 3–9 segundos",
    scoredSkills: ["listening", "speaking"],
    notes:
      "Sem preparação: o áudio começa automaticamente. 15 s para repetir. Pontua Listening e Speaking.",
  },
  {
    id: "describe_image",
    section: "speaking",
    name: "Describe Image",
    namePt: "Descrever imagem",
    scoredTasksInExam: [5, 6],
    preparationSeconds: 25,
    responseSeconds: 40,
    contentLimit: "Imagem (gráfico, mapa ou processo) + mapa de dados; sem texto de apoio",
    scoredSkills: ["speaking"],
    notes:
      "Contagem oficial no Score Guide jul/2025: 5–6 (a base de trabalho anterior dizia 6–7). 25 s de preparação e 40 s de resposta. O tempo de resposta é fixo, mesmo que o candidato termine antes.",
  },
  {
    id: "retell_lecture",
    section: "speaking",
    name: "Retell Lecture",
    namePt: "Recontar a palestra",
    scoredTasksInExam: [2, 3],
    preparationSeconds: 10,
    responseSeconds: 40,
    contentLimit: "Áudio de até 90 segundos",
    scoredSkills: ["listening", "speaking"],
    notes:
      "Contagem oficial: 2–3 (a base de trabalho anterior dizia 1–2). 10 s de preparação e 40 s de resposta.",
  },
  {
    id: "answer_short",
    section: "speaking",
    name: "Answer Short Question",
    namePt: "Responder a pergunta curta",
    scoredTasksInExam: [5, 6],
    responseSeconds: 10,
    contentLimit: "Pergunta em áudio de 3–9 segundos; resposta em uma ou poucas palavras",
    scoredSkills: ["listening"],
    notes:
      "A fonte oficial associa a tarefa apenas a Listening: a resposta é falada, mas a habilidade pontuada é compreensão auditiva (traço Vocabulary). Sem preparação.",
  },
  {
    id: "sgd",
    section: "speaking",
    name: "Summarize Group Discussion",
    namePt: "Resumir discussão em grupo",
    scoredTasksInExam: [2, 3],
    preparationSeconds: 10,
    responseSeconds: 120,
    contentLimit: "Discussão em áudio de até 3 minutos com 3 falantes",
    scoredSkills: ["listening", "speaking"],
    notes:
      "Tipo novo de 07/08/2025. Contagem oficial: 2–3 (a base de trabalho anterior dizia 2). 10 s de preparação e 2 min de resposta.",
  },
  {
    id: "rts",
    section: "speaking",
    name: "Respond to a Situation",
    namePt: "Responder a uma situação",
    scoredTasksInExam: [2, 3],
    preparationSeconds: 10,
    responseSeconds: 40,
    contentLimit: "Texto de até 60 palavras + áudio da situação",
    scoredSkills: ["speaking"],
    notes:
      "Tipo novo de 07/08/2025. 10 s de preparação e 40 s de resposta. O material de leitura/escuta serve apenas para apresentar a situação; a habilidade pontuada é Speaking.",
  },
  {
    id: "swt",
    section: "writing",
    name: "Summarize Written Text",
    namePt: "Resumir texto escrito",
    scoredTasksInExam: 2,
    responseSeconds: 600,
    contentLimit: "Passagem de até 300 palavras; resumo em 1 frase de 5–75 palavras",
    scoredSkills: ["reading", "writing"],
    notes:
      "10 minutos. Uma única frase completa de 5–75 palavras; fora desse intervalo o critério Form é zerado. Pontua Reading e Writing.",
  },
  {
    id: "write_essay",
    section: "writing",
    name: "Write Essay",
    namePt: "Escrever redação",
    scoredTasksInExam: 1,
    responseSeconds: 1200,
    contentLimit: "200–300 palavras",
    scoredSkills: ["writing"],
    notes:
      "20 minutos. 200–300 palavras; abaixo de 120 ou acima de 380 o critério Form recebe 0. Critérios: Content, Development/Structure/Coherence, Grammar, Linguistic Range, Vocabulary Range, Spelling, Written Discourse.",
  },
  {
    id: "read_fib_dropdown",
    section: "reading",
    name: "Reading: Fill in the Blanks (Dropdown)",
    namePt: "Leitura: preencher lacunas (menu suspenso)",
    scoredTasksInExam: [5, 6],
    responseSeconds: "shared_section",
    contentLimit: "Texto de até 200 palavras",
    scoredSkills: ["reading"],
    notes:
      "A tabela oficial de 2025 pontua apenas Reading, apesar do título histórico 'Reading and Writing: Fill in the Blanks'. Limite oficial de 200 palavras (a base de trabalho anterior dizia 80). Sem cronômetro por item: vale o tempo da seção de Reading.",
  },
  {
    id: "read_mcq_multi",
    section: "reading",
    name: "Reading: Multiple Choice, Multiple Answers",
    namePt: "Leitura: múltipla escolha, várias respostas",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Texto de até 350 palavras",
    scoredSkills: ["reading"],
    notes:
      "Limite oficial de 350 palavras (a base de trabalho anterior dizia 300). Penalidade por opção errada: a nota pode ficar abaixo de zero no item.",
  },
  {
    id: "reorder_paragraphs",
    section: "reading",
    name: "Reading: Re-order Paragraphs",
    namePt: "Leitura: reordenar parágrafos",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Texto de até 110 palavras, em 4–5 blocos",
    scoredSkills: ["reading"],
    notes:
      "Limite oficial de 110 palavras (a base de trabalho anterior dizia 150). Pontuação por pares adjacentes corretos.",
  },
  {
    id: "read_fib_drag",
    section: "reading",
    name: "Reading: Fill in the Blanks (Drag and Drop)",
    namePt: "Leitura: preencher lacunas (arrastar e soltar)",
    scoredTasksInExam: [4, 5],
    responseSeconds: "shared_section",
    contentLimit: "Texto de até 80 palavras",
    scoredSkills: ["reading"],
    notes: "Cada lacuna correta vale 1; não há penalidade por erro. Sem cronômetro por item.",
  },
  {
    id: "read_mcq_single",
    section: "reading",
    name: "Reading: Multiple Choice, Single Answer",
    namePt: "Leitura: múltipla escolha, resposta única",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Texto de até 110 palavras",
    scoredSkills: ["reading"],
    notes: "Sem penalidade por erro. Sem cronômetro por item.",
  },
  {
    id: "sst",
    section: "listening",
    name: "Listening: Summarize Spoken Text",
    namePt: "Escuta: resumir texto falado",
    scoredTasksInExam: 1,
    responseSeconds: 600,
    contentLimit: "Áudio de 60–90 segundos; resumo de 50–70 palavras",
    scoredSkills: ["listening", "writing"],
    notes:
      "10 minutos para ouvir e escrever. Resumo de 50–70 palavras; fora de 40–100 o critério Form recebe 0. Critérios: Content, Form, Grammar, Vocabulary, Spelling.",
  },
  {
    id: "lst_mcq_multi",
    section: "listening",
    name: "Listening: Multiple Choice, Multiple Answers",
    namePt: "Escuta: múltipla escolha, várias respostas",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 80–120 segundos",
    scoredSkills: ["listening"],
    notes:
      "Áudio oficial de 80–120 s (a base de trabalho anterior dizia 40–90). Penalidade por opção errada. Sem cronômetro por item: vale o tempo da seção de Listening.",
  },
  {
    id: "lst_fib",
    section: "listening",
    name: "Listening: Fill in the Blanks (Type In)",
    namePt: "Escuta: preencher lacunas (digitar)",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 30–60 segundos; transcrição com lacunas",
    scoredSkills: ["listening", "writing"],
    notes:
      "Cada palavra correta e escrita corretamente vale 1. A transcrição é exibida com lacunas durante o áudio.",
  },
  {
    id: "lst_hcs",
    section: "listening",
    name: "Listening: Highlight Correct Summary",
    namePt: "Escuta: destacar o resumo correto",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 30–90 segundos",
    scoredSkills: ["listening", "reading"],
    notes:
      "Pontua Listening e Reading: o candidato lê as opções de resumo. Sem penalidade por erro.",
  },
  {
    id: "lst_mcq_single",
    section: "listening",
    name: "Listening: Multiple Choice, Single Answer",
    namePt: "Escuta: múltipla escolha, resposta única",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 30–60 segundos",
    scoredSkills: ["listening"],
    notes: "Sem penalidade por erro. Sem cronômetro por item.",
  },
  {
    id: "lst_smw",
    section: "listening",
    name: "Listening: Select Missing Word",
    namePt: "Escuta: selecionar a palavra ausente",
    scoredTasksInExam: [1, 2],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 20–70 segundos; trecho final substituído por bip",
    scoredSkills: ["listening"],
    notes:
      "Contagem oficial: 1–2 (a base de trabalho anterior dizia 2–3). Sem penalidade por erro.",
  },
  {
    id: "lst_hiw",
    section: "listening",
    name: "Listening: Highlight Incorrect Words",
    namePt: "Escuta: destacar palavras incorretas",
    scoredTasksInExam: [2, 3],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 15–50 segundos; transcrição com palavras divergentes",
    scoredSkills: ["listening", "reading"],
    notes: "+1 por palavra correta destacada e −1 por palavra errada. Pontua Listening e Reading.",
  },
  {
    id: "wfd",
    section: "listening",
    name: "Listening: Write from Dictation",
    namePt: "Escuta: escrever a partir do ditado",
    scoredTasksInExam: [3, 4],
    responseSeconds: "shared_section",
    contentLimit: "Áudio de 3–5 segundos",
    scoredSkills: ["listening", "writing"],
    notes:
      "+1 por palavra correta e escrita corretamente; sem penalidade por omissão. Pontua Listening e Writing.",
  },
];

/* --------------------------------------------------------------------------------------------- */
/* Blueprint do simulado completo                                                                */
/* --------------------------------------------------------------------------------------------- */

const SECTION_1_MINUTES = 76; // mínimo oficial de Speaking & Writing
const SECTION_2_MINUTES = 23; // mínimo oficial de Reading
const SECTION_3_MINUTES = 31; // mínimo oficial de Listening

export const FULL_MOCK_BLUEPRINT: ExamBlueprint = {
  id: "full-mock",
  totalMinutes: SECTION_1_MINUTES + SECTION_2_MINUTES + SECTION_3_MINUTES,
  sections: [
    {
      section: "speaking-writing",
      minutes: SECTION_1_MINUTES,
      tasks: [
        { type: "read_aloud", count: 6 },
        { type: "repeat_sentence", count: 10 },
        { type: "describe_image", count: 5 },
        { type: "retell_lecture", count: 2 },
        { type: "answer_short", count: 5 },
        { type: "sgd", count: 2 },
        { type: "rts", count: 2 },
        { type: "swt", count: 2 },
        { type: "write_essay", count: 1 },
      ],
    },
    {
      section: "reading",
      minutes: SECTION_2_MINUTES,
      tasks: [
        { type: "read_fib_dropdown", count: 5 },
        { type: "read_mcq_multi", count: 2 },
        { type: "reorder_paragraphs", count: 2 },
        { type: "read_fib_drag", count: 4 },
        { type: "read_mcq_single", count: 2 },
      ],
    },
    {
      section: "listening",
      minutes: SECTION_3_MINUTES,
      tasks: [
        { type: "sst", count: 1 },
        { type: "lst_mcq_multi", count: 2 },
        { type: "lst_fib", count: 2 },
        { type: "lst_hcs", count: 2 },
        { type: "lst_mcq_single", count: 2 },
        { type: "lst_smw", count: 1 },
        { type: "lst_hiw", count: 2 },
        { type: "wfd", count: 3 },
      ],
    },
  ],
  questionCount: 65,
  questionCountRange: [65, 75],
  sourceUrl: URL_TEST_TAKER_SCORE_GUIDE,
  consultedAt: CONSULTED_AT,
  confirmed: false,
  notes:
    "A Pearson não publica um blueprint fixo: cada versão da prova recebe uma combinação das faixas oficiais, equilibrada para a duração total. Este blueprint usa o limite inferior de cada faixa (65 questões; 76+23+31 = 130 min) e é uma aproximação declarada, não uma reprodução do formulário oficial. As faixas de duração das seções somadas dão 130–153 min, mas não formam um total oficial: versões diferentes são balanceadas; a Pearson declara ~2 h e máximo de 2h18. O simulado não reproduz o Personal Introduction (não pontuado).",
  omissions: [
    "Personal Introduction (aquecimento não pontuado)",
    "Variação real de contagem por versão da prova (faixas oficiais)",
    "Itens com mídia proprietária que o banco não possui",
    "Revisão humana oficial do critério Content (o produto usa IA com evidências)",
  ],
};

/** Id reservado do mini-simulado. A composição é definida na Fase 9. */
export const MINI_MOCK_ID = "mini-mock" as const;

/** Aviso que acompanha o mini-simulado para não ser confundido com o exame completo. */
export const MINI_MOCK_NOTE =
  "Mini-simulado: sessão curta de treino cronometrado. Não corresponde ao blueprint oficial (~2 h) nem ao PTE Academic completo.";

/* --------------------------------------------------------------------------------------------- */
/* Fontes por afirmação                                                                          */
/* --------------------------------------------------------------------------------------------- */

export const EXAM_SOURCES: readonly ExamSource[] = [
  {
    claim:
      "O formato vigente (provas a partir de 07/08/2025) mantém as três seções e os 20 tipos originais e acrescenta 2 tipos em Speaking & Writing: Summarize Group Discussion e Respond to a Situation, totalizando 22 tipos pontuados.",
    sourceUrl: URL_UPDATES_2025,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Página oficial de atualizações de 2025 da Pearson.",
  },
  {
    claim:
      "A prova continua com aproximadamente 2 horas e o número de questões aumenta sem alterar o limite de tempo por questão; a duração individual de cada tarefa permanece a mesma.",
    sourceUrl: URL_CHANGES_2025,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Artigo oficial 'PTE changes 2025: everything you need to know'.",
  },
  {
    claim:
      "A Parte 1 (Speaking & Writing) tem 9 tipos de questão e duração de 76–84 minutos; o Personal Introduction é o primeiro item, não pontuado, com 25 s de preparação e 30 s de resposta.",
    sourceUrl: URL_FORMAT_SPEAKING_WRITING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Página oficial de formato da seção Speaking & Writing.",
  },
  {
    claim:
      "A Parte 2 (Reading) tem 5 tipos de questão e duração de 23–30 minutos; não há tempo individual por questão, apenas o tempo total da seção.",
    sourceUrl: URL_FORMAT_READING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Página oficial de formato da seção Reading.",
  },
  {
    claim:
      "A Parte 3 (Listening) tem 8 tipos de questão e duração de 31–39 minutos; cada áudio é reproduzido uma única vez.",
    sourceUrl: URL_FORMAT_LISTENING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Página oficial de formato da seção Listening.",
  },
  {
    claim:
      "O exame tem 22 tipos de questão e 65–75 questões pontuadas; o score global e os scores das quatro habilidades comunicativas usam a escala 10–90.",
    sourceUrl: URL_TEST_TAKER_SCORE_GUIDE,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    publishedAt: "2025-07",
    note: "Test Taker Score Guide: tabelas 'No. of questions' e escala de scores.",
  },
  {
    claim:
      "A matriz tarefa×habilidade e os critérios de pontuação por tipo (incluindo quais tarefas pontuam mais de uma habilidade) estão nas tabelas de scoring do Score Guide; 7 dos 22 tipos têm revisão humana adicional do critério Content.",
    sourceUrl: URL_INSTITUTION_SCORE_GUIDE,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    publishedAt: "2025-07",
    note: "Score Guide Institution, jul/2025, páginas de scoring por tarefa.",
  },
  {
    claim:
      "A duração máxima declarada do exame é de 2 horas e 18 minutos; as faixas de duração das seções não somam o total porque versões diferentes da prova são balanceadas para a duração total.",
    sourceUrl: URL_INSTITUTION_SCORE_GUIDE,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    publishedAt: "2025-07",
    note: "Glossário e nota de tempos do Score Guide Institution (jul/2025).",
  },
  {
    claim:
      "Read Aloud: a página de formato afirma que a tarefa afeta reading, speaking, pronunciation e oral fluency; a tabela do Score Guide lista apenas Speaking. A spec adota reading+speaking e marca o tipo como aproximação.",
    sourceUrl: URL_FORMAT_SPEAKING_WRITING,
    consultedAt: CONSULTED_AT,
    status: "approximation",
    note: "Divergência entre duas fontes oficiais; resolver quando a Pearson publicar matriz inequívoca.",
  },
  {
    claim:
      "Read Aloud usa texto de até 60 palavras e preparação de 30–40 segundos; Repeat Sentence usa áudio de 3–9 segundos, sem preparação, com 15 segundos para repetir.",
    sourceUrl: URL_FORMAT_SPEAKING_WRITING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
  },
  {
    claim:
      "Reading: Fill in the Blanks (Dropdown) aceita texto de até 200 palavras; Multiple Choice (Multiple Answers) até 350 palavras; Re-order Paragraphs até 110 palavras; Fill in the Blanks (Drag and Drop) até 80 palavras; Multiple Choice (Single Answer) até 110 palavras.",
    sourceUrl: URL_FORMAT_READING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Limites por tipo na página oficial de Reading; corrigem a base de trabalho anterior.",
  },
  {
    claim:
      "Listening: Summarize Spoken Text usa áudio de 60–90 s e resumo de 50–70 palavras; Multiple Choice (Multiple Answers) áudio de 80–120 s; Fill in the Blanks áudio de 30–60 s; Highlight Correct Summary 30–90 s; Multiple Choice (Single) 30–60 s; Select Missing Word 20–70 s; Highlight Incorrect Words 15–50 s; Write from Dictation 3–5 s.",
    sourceUrl: URL_FORMAT_LISTENING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Limites por tipo na página oficial de Listening.",
  },
  {
    claim:
      "Tempos das tarefas de fala: Describe Image 25 s de preparação e 40 s de resposta; Re-tell Lecture 10 s e 40 s; Answer Short Question 10 s de resposta sem preparação; Summarize Group Discussion 10 s e 2 min; Respond to a Situation 10 s e 40 s.",
    sourceUrl: URL_FORMAT_SPEAKING_WRITING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Instruções oficiais de cada tipo na página de Speaking & Writing.",
  },
  {
    claim:
      "Summarize Written Text: passagem de até 300 palavras, 10 minutos e uma única frase de até 75 palavras; Write Essay: 20 minutos e 200–300 palavras.",
    sourceUrl: URL_FORMAT_SPEAKING_WRITING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Limites e tempos oficiais das duas tarefas de Writing.",
  },
  {
    claim:
      "As contagens por tipo usadas em EXAM_TASKS vêm das tabelas 'No. of questions' do Test Taker Score Guide: Read Aloud 6–7, Repeat Sentence 10–12, Describe Image 5–6, Re-tell Lecture 2–3, Answer Short Question 5–6, Summarize Group Discussion 2–3, Respond to a Situation 2–3, Summarize Written Text 2, Write Essay 1, FIB Dropdown 5–6, MCQ Multiple 2–3, Re-order Paragraphs 2–3, FIB Drag and Drop 4–5, MCQ Single 2–3, Summarize Spoken Text 1, Listening MCQ Multiple 2–3, Listening FIB 2–3, Highlight Correct Summary 2–3, Listening MCQ Single 2–3, Select Missing Word 1–2, Highlight Incorrect Words 2–3, Write from Dictation 3–4.",
    sourceUrl: URL_TEST_TAKER_SCORE_GUIDE,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    publishedAt: "2025-07",
    note: "Faixas oficiais por tipo; a soma dos mínimos é 65 e a dos máximos é 85, mas nenhuma prova usa todos os mínimos ou todos os máximos ao mesmo tempo.",
  },
  {
    claim:
      "O Score Guide é a referência para a escala 10–90 e para as quatro habilidades comunicativas (Listening, Reading, Speaking, Writing); não há nota de aprovação/reprovação, apenas o score exigido por cada instituição.",
    sourceUrl: URL_SCORING,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Página oficial de scoring do PTE Academic.",
  },
  {
    claim:
      "O teste tem três partes na ordem Speaking & Writing, Reading e Listening; a visão geral oficial confirma as três seções e a escala de 10–90.",
    sourceUrl: URL_FORMAT_OVERVIEW,
    consultedAt: CONSULTED_AT,
    status: "confirmed",
    note: "Página oficial de visão geral do formato.",
  },
];
