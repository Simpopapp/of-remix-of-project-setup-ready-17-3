/**
 * Corpus de calibração do avaliador de IA (Fase 5/s4).
 *
 * Cada entrada referencia uma questão REAL do banco (`src/data/bank/`) e adiciona
 * apenas a ANOTAÇÃO de calibração: a resposta de amostra e a nota de referência
 * curada. As respostas de fala são transcrições-alvo (não há áudio neste corpus);
 * portanto a calibração NÃO mede pronúncia nem prosódia — os `note` declaram isso.
 *
 * As amostras de escrita e fala são artefatos de medição, não conteúdo do exame:
 * foram escritas para produzir âncoras altas e baixas e nunca são exibidas ao aluno
 * como resposta oficial. Questões de seleção usam o gabarito do próprio item
 * (resposta correta ou parcial); quando o formato não admite parcialidade, a
 * âncora baixa usa um distrator existente no item, também anotado no `note`.
 *
 * Client-safe e puro: sem I/O, sem servidor, sem chave. A integridade contra o
 * banco é provada em `src/test/ai/calibration.test.ts`.
 */

import type { TaskType } from "@/domain";

export interface CalibrationItem {
  type: TaskType;
  /** id REAL de um item do banco (`src/data/bank/`) — nunca inventado. */
  questionId: string;
  /** Amostra de resposta de referência anotada; para fala, a transcrição-alvo. */
  response: { text?: string; transcript?: string };
  /** Nota de referência na escala de tentativa 0–100, curada. */
  referenceScore: number;
  /** Justificativa curta da nota (pt-BR), exibível no relatório. */
  note: string;
}

export const CALIBRATION_CORPUS: readonly CalibrationItem[] = [
  /* ---------------------------------------------------------------- Speaking */
  {
    type: "read_aloud",
    questionId: "stormedugo-read_aloud-001",
    response: {
      transcript:
        "Climate change mitigation consists of actions to limit global warming and its related effects. These include reducing greenhouse gas emissions and enhancing sinks of greenhouse gases. Mitigation may also be achieved by increasing the capacity of carbon sinks, such as reforestation.",
    },
    referenceScore: 90,
    note: "Leitura integral do texto, sem omissões; pronúncia não é medida nesta calibração (sem áudio).",
  },
  {
    type: "read_aloud",
    questionId: "cand-81-read_aloud-051",
    response: {
      transcript:
        "The bill calls for the establishment of the National Landslide Hazards Reduction Program within one year. The program identifies landslide hazards and risks, reduces losses, and protects communities.",
    },
    referenceScore: 55,
    note: "Cobre o núcleo, mas omite a expressão 'of becoming law' e o trecho final sobre comunicação e preparação para emergências; pronúncia não avaliada.",
  },
  {
    type: "repeat_sentence",
    questionId: "goarno-repeat_sentence-001",
    response: {
      transcript: "Reducing stress levels can significantly improve your overall quality of life.",
    },
    referenceScore: 92,
    note: "Reprodução exata da frase, com todos os grupos lexicais; pronúncia não avaliada.",
  },
  {
    type: "repeat_sentence",
    questionId: "cand-86-repeat_sentence-050",
    response: {
      transcript: "The wheelchair lift upgraded next month.",
    },
    referenceScore: 60,
    note: "Mantém o núcleo lexical, mas omite 'has been' e troca 'this' por 'next', alterando tempo e referência; pronúncia não avaliada.",
  },
  {
    type: "describe_image",
    questionId: "owid-describe_image-001",
    response: {
      transcript:
        "The chart shows life expectancy at birth from 1543 to 2023. Overall, life expectancy has risen sharply, especially after the twentieth century. In 2023, Monaco had the highest figure at 86.4 years, followed by San Marino at 85.7 and Hong Kong at 85.5. Nigeria had the lowest at 54.5 years. In 1543, the United Kingdom's life expectancy was only 33.9 years.",
    },
    referenceScore: 84,
    note: "Cobre tendência, extremos e um exemplo histórico com números; pronúncia não avaliada.",
  },
  {
    type: "describe_image",
    questionId: "owid-describe_image-003",
    response: {
      transcript:
        "The chart shows GDP per capita in different countries. Singapore has the highest value and Burundi the lowest, so some countries are much richer than others.",
    },
    referenceScore: 50,
    note: "Identifica o tema e os dois extremos, mas não usa números, tendência ou comparação temporal; pronúncia não avaliada.",
  },
  {
    type: "retell_lecture",
    questionId: "edknot-retell_lecture-001",
    response: {
      transcript:
        "The lecture explains plate tectonics as the theory that Earth's lithosphere is broken into rigid plates floating on the semi-fluid asthenosphere. It describes three boundary types. At divergent boundaries, plates move apart and magma rises to form new oceanic crust, as at the Mid-Atlantic Ridge. At convergent boundaries, plates collide; subduction creates trenches and volcanic arcs, while continental collisions build mountain ranges such as the Himalayas. At transform boundaries, plates slide horizontally, causing earthquakes like those on the San Andreas Fault. The lecturer concludes that this theory helps predict earthquakes, understand volcanism and reconstruct Earth's geological history.",
    },
    referenceScore: 88,
    note: "Cobre a tese e os três tipos de limite com exemplos; pronúncia não avaliada.",
  },
  {
    type: "retell_lecture",
    questionId: "edknot-retell_lecture-003",
    response: {
      transcript:
        "The lecture is about the circular economy. It says the old linear economy takes materials, makes products and throws them away, which is wasteful. A circular economy tries to eliminate waste and keep materials in use, for example by leasing a washing machine or making phones that can be repaired. It also says this can reduce costs for businesses.",
    },
    referenceScore: 55,
    note: "Cobre a definição e um exemplo, mas não explicita os três princípios nem o contraste com reciclagem; pronúncia não avaliada.",
  },
  {
    type: "answer_short",
    questionId: "edknot-answer_short-001",
    response: { transcript: "Platform" },
    referenceScore: 100,
    note: "Resposta curta exata e suficiente.",
  },
  {
    type: "answer_short",
    questionId: "cand-22-answer_short-091",
    response: { transcript: "Two days" },
    referenceScore: 15,
    note: "Resposta incorreta: o dia extra é um, não dois; mantém apenas o campo semântico da pergunta.",
  },
  {
    type: "sgd",
    questionId: "pearson-sgd-001",
    response: {
      transcript:
        "The group discusses peer tutoring at university. Speaker 1 had a positive experience with a trained tutor in advanced calculus, saying the tutor translated difficult concepts into student language and improved their confidence. Speaker 2, who tutored programming, says teaching helped them review the material and explain it clearly. Speaker 3 prefers informal study with friends, arguing it feels more comfortable and flexible. Speaker 1 responds that formal sessions are more effective because a trained tutor prevents the group from simply complaining. Speaker 2 adds that tutors must guide without giving answers.",
    },
    referenceScore: 86,
    note: "Cobre as três posições e a réplica sobre a diferença entre tutoria formal e estudo informal; pronúncia não avaliada.",
  },
  {
    type: "sgd",
    questionId: "pearson-sgd-003",
    response: {
      transcript:
        "The students discuss office hours. One finds them intimidating and is unsure what to ask. Another says the timing is difficult and students are often tired. The third suggests preparing specific questions and forming a study group before going to the professor.",
    },
    referenceScore: 58,
    note: "Cobre os problemas e uma solução, mas omite as alternativas (tutoring center/fóruns) e o detalhe sobre professores mais acessíveis; pronúncia não avaliada.",
  },
  {
    type: "rts",
    questionId: "pearson-rts-001",
    response: {
      transcript:
        "Good morning. I'm sorry to bother you, but I've been ill with the flu for the past week and couldn't concentrate on the assignment. I have a doctor's note here. I'm feeling a little better now, and I'd like to ask whether I could have an extension. I've completed most of the research and I could submit the final version by the end of next week.",
    },
    referenceScore: 88,
    note: "Reconhece a situação, apresenta a justificativa e o documento, pede a extensão e propõe um prazo; pronúncia não avaliada.",
  },
  {
    type: "rts",
    questionId: "cand-28-rts-028",
    response: {
      transcript:
        "I need all the content and references before I can design the poster. Could you send them by Friday so I have time to prepare a draft?",
    },
    referenceScore: 62,
    note: "Faz o pedido central e define um prazo, mas não explica a dependência nem propõe como o grupo pode colaborar; pronúncia não avaliada.",
  },

  /* ----------------------------------------------------------------- Writing */
  {
    type: "swt",
    questionId: "goarno-swt-101",
    response: {
      text: "Global temperature increases are causing severe weather, sea level rise, and unpredictable precipitation, resulting in flooding, disrupted food supply chains, and forced migration, prompting nations to invest in adaptive infrastructure, early warning systems, and emissions reduction policies, with collaborative efforts among governments, scientists, and communities being essential for building resilience and ensuring a sustainable future.",
    },
    referenceScore: 90,
    note: "Uma única frase, dentro de 5–75 palavras, que cobre impactos e respostas de adaptação.",
  },
  {
    type: "swt",
    questionId: "goarno-swt-102",
    response: {
      text: "AI and automation are transforming industries by increasing efficiency and innovation, but they also threaten jobs, so workers will need reskilling to adapt to the new roles created by these technologies.",
    },
    referenceScore: 55,
    note: "Uma frase válida e fiel ao primeiro parágrafo, mas omite as questões éticas e regulatórias do texto.",
  },
  {
    type: "write_essay",
    questionId: "band9-write_essay-001",
    response: {
      text: `Technological advancements and evolving workplace practices make reduced working hours inevitable in coming decades. I strongly agree that future generations will spend less time working than current employees due to productivity gains and shifting societal priorities. This essay will discuss automation-driven efficiency and improved work-life balance demands as key factors.

To begin with, artificial intelligence and robotics will dramatically increase workplace productivity. Machines now perform tasks that previously required human labour, allowing equivalent output with reduced working time. For example, German companies using automation have maintained production levels while implementing 28-hour work weeks through their Kurzarbeit system. As algorithms grow more sophisticated, this trend will accelerate across industries, making traditional 40-hour schedules obsolete.

Furthermore, employees increasingly prioritise personal wellbeing over excessive work commitments. Many workers now reject the notion that career success requires constant availability, as demonstrated by Iceland's successful trial of four-day weeks without salary reductions. Reduced hours also benefit environmental sustainability by decreasing commuting frequency. A 2022 New Zealand study found that shortened work weeks lowered carbon emissions by 14% in participating firms through fewer employee journeys.

In conclusion, both economic efficiency and quality-of-life considerations will drive global reductions in working hours. While some industries may adapt slower than others, the combined pressure of technological progress and workforce expectations makes this transition unavoidable. Societies must plan adequate policies to ensure smooth implementation of shorter work schedules that balance productivity with human needs.`,
    },
    referenceScore: 88,
    note: "Ensaio dentro de 200–300 palavras, com posição clara, dois argumentos desenvolvidos e exemplos.",
  },
  {
    type: "write_essay",
    questionId: "band9-write_essay-002",
    response: {
      text: `Some organisations involve workers in decision-making, and this approach has both advantages and disadvantages. In my opinion, the benefits usually outweigh the drawbacks when the process is well organised.

One advantage is that employees feel more motivated when their opinions are considered. If workers help to decide how a task should be done, they may take more responsibility for the result. This can also improve communication between managers and staff, because people understand why a decision was made. In addition, employees often know the daily problems of the workplace better than senior managers, so their ideas can improve practical solutions.

On the other hand, involving everyone can make decisions slower. A company may need to react quickly to a customer or a competitor, and long meetings can delay action. Some employees may also lack the information or experience to judge financial risks. If managers always follow the majority, they may avoid difficult but necessary choices.

In conclusion, worker participation can improve motivation and practical decisions, but it should not replace clear leadership. Organisations should involve staff in decisions that affect their work while keeping fast, accountable channels for urgent matters. This balanced approach allows the company to benefit from employee knowledge without losing efficiency.`,
    },
    referenceScore: 52,
    note: "Ensaio dentro de 200–300 palavras e com estrutura reconhecível, mas os exemplos são genéricos e a discussão permanece superficial.",
  },

  /* ----------------------------------------------------------------- Reading */
  {
    type: "read_fib_dropdown",
    questionId: "goarno-read_fib_dropdown-001",
    response: {
      text: "Lacuna 1: assist; Lacuna 2: indicating; Lacuna 3: oversimplify; Lacuna 4: combating.",
    },
    referenceScore: 100,
    note: "Quatro lacunas corretas segundo o gabarito do item.",
  },
  {
    type: "read_fib_dropdown",
    questionId: "goarno-read_fib_dropdown-002",
    response: {
      text: "Lacuna 1: ability; Lacuna 2: breakdown; Lacuna 3: derive; Lacuna 4: cure.",
    },
    referenceScore: 75,
    note: "Três lacunas corretas; a quarta usa 'cure' em vez de 'curb', alterando o sentido.",
  },
  {
    type: "read_mcq_multi",
    questionId: "goarno-read_mcq_multi-101",
    response: {
      text: "Alternativas: 1, 3.",
    },
    referenceScore: 100,
    note: "Seleciona exatamente as duas alternativas sustentadas pelo texto.",
  },
  {
    type: "read_mcq_multi",
    questionId: "goarno-read_mcq_multi-102",
    response: {
      text: "Alternativas: 1, 3.",
    },
    referenceScore: 60,
    note: "Seleciona duas de três alternativas corretas; omite a referência à adoção do cristianismo pelas elites locais.",
  },
  {
    type: "reorder_paragraphs",
    questionId: "goarno-reorder_paragraphs-001",
    response: {
      text: "Ordem: 1, 2, 3, 4, 5.",
    },
    referenceScore: 100,
    note: "Ordem integral correta (a sequência apresentada é a ordem de referência do item).",
  },
  {
    type: "reorder_paragraphs",
    questionId: "goarno-reorder_paragraphs-003",
    response: {
      text: "Ordem: 1, 3, 2, 4, 5.",
    },
    referenceScore: 55,
    note: "Inverte os parágrafos 2 e 3; a introdução histórica fica depois da descrição técnica, quebrando a coesão.",
  },
  {
    type: "read_fib_drag",
    questionId: "goarno-read_fib_drag-101",
    response: {
      text: "Lacuna 1: compromised; Lacuna 2: prioritize; Lacuna 3: consequences; Lacuna 4: restore.",
    },
    referenceScore: 100,
    note: "Quatro lacunas corretas segundo o gabarito do item.",
  },
  {
    type: "read_fib_drag",
    questionId: "goarno-read_fib_drag-103",
    response: {
      text: "Lacuna 1: repair; Lacuna 2: interfering; Lacuna 3: advise; Lacuna 4: complying.",
    },
    referenceScore: 75,
    note: "Três lacunas corretas; a quarta usa 'complying' em vez de 'relaxation', quebrando a colocação.",
  },
  {
    type: "read_mcq_single",
    questionId: "goarno-read_mcq_single-101",
    response: {
      text: "Alternativa 1.",
    },
    referenceScore: 100,
    note: "Escolhe a alternativa que sintetiza o argumento do texto sobre Cahokia.",
  },
  {
    type: "read_mcq_single",
    questionId: "goarno-read_mcq_single-102",
    response: {
      text: "Alternativa 1.",
    },
    referenceScore: 20,
    note: "Escolhe uma alternativa que não corresponde ao argumento sobre engenharia ambiental dos 'clam gardens'.",
  },

  /* --------------------------------------------------------------- Listening */
  {
    type: "sst",
    questionId: "goarno-sst-101",
    response: {
      text: "Historical evidence suggests that before the widespread use of artificial lighting, humans practised biphasic or segmented sleep, involving a four-hour 'first sleep' after sundown, a wakeful hour used for prayer, reflection or socialising, and then a 'second sleep' until dawn, which implies that waking at night may be a natural biological rhythm rather than a disorder.",
    },
    referenceScore: 90,
    note: "Resumo dentro de 50–70 palavras que cobre o padrão bifásico, a transição histórica e a implicação.",
  },
  {
    type: "sst",
    questionId: "cand-21-sst-057",
    response: {
      text: "The lecture is about touch and emotions. A psychologist studied how people communicate feelings through touch. In the experiment, one person touched another's arm to send emotions such as sympathy and love. The reporter interviewed the researcher about his work. The research suggests that touch, like the face and voice, can carry distinct emotional messages.",
    },
    referenceScore: 55,
    note: "Cobre o tema e o experimento, mas omite o número de emoções testadas e os resultados específicos; resumo ainda dentro de 50–70 palavras.",
  },
  {
    type: "lst_mcq_multi",
    questionId: "goarno-lst_mcq_multi-101",
    response: {
      text: "Alternativas: 2, 3.",
    },
    referenceScore: 100,
    note: "Seleciona as duas vantagens da inovação aberta mencionadas no áudio.",
  },
  {
    type: "lst_mcq_multi",
    questionId: "goarno-lst_mcq_multi-102",
    response: {
      text: "Alternativa 1.",
    },
    referenceScore: 50,
    note: "Seleciona apenas uma das duas alternativas corretas; omite o longo tempo de exposição das primeiras fotografias.",
  },
  {
    type: "lst_fib",
    questionId: "goarno-lst_fib-101",
    response: {
      text: "Lacuna 1: integration; Lacuna 2: precede; Lacuna 3: composition; Lacuna 4: guaranteed; Lacuna 5: disruption.",
    },
    referenceScore: 100,
    note: "Cinco lacunas corretas segundo o gabarito do item.",
  },
  {
    type: "lst_fib",
    questionId: "goarno-lst_fib-102",
    response: {
      text: "Lacuna 1: relationship; Lacuna 2: deficiency; Lacuna 3: interact; Lacuna 4: susceptibility; Lacuna 5: suggestions.",
    },
    referenceScore: 80,
    note: "Quatro lacunas corretas; a última usa 'suggestions' em vez de 'recommendations'.",
  },
  {
    type: "lst_hcs",
    questionId: "goarno-lst_hcs-101",
    response: {
      text: "Alternativa 2.",
    },
    referenceScore: 100,
    note: "Escolhe o resumo que explica a difusão de responsabilidade e a interpretação do comportamento alheio.",
  },
  {
    type: "lst_hcs",
    questionId: "goarno-lst_hcs-102",
    response: {
      text: "Alternativa 1.",
    },
    referenceScore: 20,
    note: "Escolhe um resumo que distorce o papel das bibliotecas circulantes e a lógica comercial do formato em três volumes.",
  },
  {
    type: "lst_mcq_single",
    questionId: "goarno-lst_mcq_single-101",
    response: {
      text: "Alternativa 2.",
    },
    referenceScore: 100,
    note: "Identifica a inversão do símbolo de status: de lazer para falta de tempo livre.",
  },
  {
    type: "lst_mcq_single",
    questionId: "goarno-lst_mcq_single-102",
    response: {
      text: "Alternativa 1.",
    },
    referenceScore: 20,
    note: "Escolhe a alternativa que descreve a memória como gravação passiva, contrariando o áudio.",
  },
  {
    type: "lst_smw",
    questionId: "goarno-lst_smw-101",
    response: {
      text: "Alternativa 2.",
    },
    referenceScore: 100,
    note: "Completa a previsão dos economistas com 'food prices', coerente com o dilema de uso da terra.",
  },
  {
    type: "lst_smw",
    questionId: "goarno-lst_smw-103",
    response: {
      text: "Alternativa 2.",
    },
    referenceScore: 20,
    note: "Escolhe 'ignoring audience preferences', que não completa a inferência sobre autoria múltipla.",
  },
  {
    type: "lst_hiw",
    questionId: "goarno-lst_hiw-101",
    response: {
      text: "Palavras: statistical, demonstrate, techniques, interact, scholastic, careers.",
    },
    referenceScore: 100,
    note: "Identifica as seis palavras divergentes entre o texto exibido e o áudio.",
  },
  {
    type: "lst_hiw",
    questionId: "goarno-lst_hiw-102",
    response: {
      text: "Palavras: efficient, instructive, outgoing, reading, accurate, growth.",
    },
    referenceScore: 55,
    note: "Identifica cinco divergências reais, mas marca 'growth' (que não diverge) e omite 'prove' e 'worth'.",
  },
  {
    type: "wfd",
    questionId: "goarno-wfd-001",
    response: {
      text: "Scientists are discovering new links between genes and diseases.",
    },
    referenceScore: 100,
    note: "Transcrição exata da frase ditada.",
  },
  {
    type: "wfd",
    questionId: "cand-85-wfd-064",
    response: {
      text: "There are more opportunities to receive grants in most artistic fields.",
    },
    referenceScore: 70,
    note: "Mantém o conteúdo, mas omite o artigo definido antes de 'grants'.",
  },
];

/** Itens do corpus para um tipo, na ordem declarada acima. */
export function itemsForType(type: TaskType): readonly CalibrationItem[] {
  return CALIBRATION_CORPUS.filter((item) => item.type === type);
}
