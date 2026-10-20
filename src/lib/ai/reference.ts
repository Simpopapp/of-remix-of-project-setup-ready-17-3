/**
 * Resolução da referência de avaliação — SERVER-SIDE.
 *
 * Separa três coisas que o produto não pode confundir:
 * 1. `untrusted` — conteúdo que o aluno vê (enunciado, passagem, opções) + a
 *    resposta dele. Vai ao modelo como dado não confiável.
 * 2. `judgeReference` — referência reservada (gabarito, transcrição, amostra) que
 *    o juiz usa para comparar. Vai no system prompt e NUNCA ao cliente.
 * 3. `protectedSamples` — subconjunto de `judgeReference` que o leak-guard vigia
 *    (só o que é oculto do aluno; texto visível não é "vazamento").
 *
 * Este módulo é puro: recebe a `Question` já carregada e devolve strings.
 */

import type { Question } from "@/domain";

export interface UntrustedPart {
  label: string;
  content: string;
}

export interface QuestionReference {
  /** Há material suficiente para uma avaliação honesta? */
  hasReference: boolean;
  /** Referência enviada ao juiz no system prompt (nunca ao cliente). */
  judgeReference: string[];
  /** Trechos ocultos que o leak-guard deve impedir de sair na resposta. */
  protectedSamples: string[];
  /** Conteúdo visível ao aluno, enviado como dado não confiável. */
  untrusted: UntrustedPart[];
}

function clean(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionTexts(options: readonly string[], indexes: readonly number[]): string[] {
  return indexes.map((index) => clean(options[index])).filter((text) => text.length > 0);
}

function buildFor(question: Question): QuestionReference {
  switch (question.type) {
    case "read_aloud": {
      const text = clean(question.data.text);
      return {
        hasReference: text.length > 0,
        judgeReference: text ? [text] : [],
        protectedSamples: [],
        untrusted: text ? [{ label: "TEXTO_PARA_LER", content: text }] : [],
      };
    }

    case "repeat_sentence": {
      const transcript = clean(question.data.transcript);
      return {
        hasReference: transcript.length > 0,
        judgeReference: transcript ? [transcript] : [],
        protectedSamples: transcript ? [transcript] : [],
        untrusted: [],
      };
    }

    case "describe_image": {
      const facts = question.data.facts.map(clean).filter(Boolean);
      const keywords = question.data.keywords.map(clean).filter(Boolean);
      const alt = clean(question.data.alt);
      return {
        hasReference: facts.length > 0 || keywords.length > 0,
        judgeReference: [...facts, ...keywords],
        protectedSamples: facts,
        untrusted: alt ? [{ label: "DESCRICAO_DA_IMAGEM", content: alt }] : [],
      };
    }

    case "retell_lecture": {
      const transcript = clean(question.data.transcript);
      const sample = clean(question.data.sample);
      const keywords = question.data.keywords.map(clean).filter(Boolean);
      return {
        hasReference: transcript.length > 0 || sample.length > 0,
        judgeReference: [transcript, sample, ...keywords].filter(Boolean),
        protectedSamples: [transcript, sample].filter(Boolean),
        untrusted: [],
      };
    }

    case "answer_short": {
      const questionText = clean(question.data.question);
      const answers = question.data.answers.map(clean).filter(Boolean);
      return {
        hasReference: answers.length > 0,
        judgeReference: answers,
        protectedSamples: answers,
        untrusted: questionText ? [{ label: "PERGUNTA", content: questionText }] : [],
      };
    }

    case "sgd": {
      const turns = question.data.turns.map((turn) => `${turn.speaker}: ${turn.text}`);
      const keywords = question.data.keywords.map(clean).filter(Boolean);
      return {
        hasReference: turns.length > 0,
        judgeReference: [...turns, ...keywords],
        protectedSamples: turns,
        untrusted: [],
      };
    }

    case "rts": {
      const scenario = clean(question.data.scenario);
      return {
        hasReference: scenario.length > 0,
        judgeReference: scenario ? [scenario] : [],
        protectedSamples: [],
        untrusted: scenario ? [{ label: "SITUACAO", content: scenario }] : [],
      };
    }

    case "swt": {
      const text = clean(question.data.text);
      const sample = clean(question.data.sample);
      const keywords = question.data.keywords.map(clean).filter(Boolean);
      return {
        hasReference: text.length > 0,
        judgeReference: [sample, ...keywords].filter(Boolean),
        protectedSamples: sample ? [sample] : [],
        untrusted: text ? [{ label: "PASSAGEM", content: text }] : [],
      };
    }

    case "write_essay": {
      const prompt = clean(question.data.prompt);
      const sample = clean(question.data.sample);
      return {
        hasReference: prompt.length > 0,
        judgeReference: sample ? [sample] : [],
        protectedSamples: sample ? [sample] : [],
        untrusted: prompt ? [{ label: "ENUNCIADO", content: prompt }] : [],
      };
    }

    case "read_fib_dropdown": {
      const passage = clean(question.data.passage);
      const correct = question.data.blanks.map((blank) => clean(blank.options[blank.answer]));
      const options = question.data.blanks.map((blank, index) => {
        const list = blank.options.map(clean).filter(Boolean).join(" / ");
        return `Lacuna ${String(index + 1)}: ${list}`;
      });
      return {
        hasReference: correct.some(Boolean),
        judgeReference: correct.filter(Boolean),
        protectedSamples: correct.filter(Boolean),
        untrusted: [
          ...(passage ? [{ label: "PASSAGEM_COM_LACUNAS", content: passage }] : []),
          ...(options.length > 0
            ? [{ label: "OPCOES_POR_LACUNA", content: options.join("\n") }]
            : []),
        ],
      };
    }

    case "read_fib_drag": {
      const passage = clean(question.data.passage);
      const bank = question.data.bank.map(clean).filter(Boolean);
      const correct = question.data.answers
        .map((index) => clean(question.data.bank[index]))
        .filter(Boolean);
      return {
        hasReference: correct.length > 0,
        judgeReference: correct,
        protectedSamples: correct,
        untrusted: [
          ...(passage ? [{ label: "PASSAGEM_COM_LACUNAS", content: passage }] : []),
          ...(bank.length > 0 ? [{ label: "BANCO_DE_PALAVRAS", content: bank.join(" / ") }] : []),
        ],
      };
    }

    case "read_mcq_single":
    case "read_mcq_multi": {
      const passage = clean(question.data.passage);
      const questionText = clean(question.data.question);
      const options = question.data.options.map(clean).filter(Boolean);
      const indexes = Array.isArray(question.data.answer)
        ? question.data.answer
        : [question.data.answer];
      const correct = optionTexts(question.data.options, indexes);
      return {
        hasReference: correct.length > 0,
        judgeReference: correct,
        protectedSamples: correct,
        untrusted: [
          ...(passage ? [{ label: "PASSAGEM", content: passage }] : []),
          ...(questionText ? [{ label: "PERGUNTA", content: questionText }] : []),
          ...(options.length > 0 ? [{ label: "OPCOES", content: options.join("\n") }] : []),
        ],
      };
    }

    case "reorder_paragraphs": {
      const paragraphs = question.data.paragraphs.map(clean).filter(Boolean);
      return {
        hasReference: paragraphs.length > 0,
        judgeReference:
          paragraphs.length > 0
            ? [paragraphs.map((text, index) => `${String(index + 1)}. ${text}`).join("\n")]
            : [],
        // A ordem correta é a referência; os parágrafos em si são visíveis ao aluno.
        protectedSamples: [],
        untrusted: [],
      };
    }

    case "sst": {
      const transcript = clean(question.data.transcript);
      const sample = clean(question.data.sample);
      const keywords = question.data.keywords.map(clean).filter(Boolean);
      return {
        hasReference: transcript.length > 0,
        judgeReference: [transcript, sample, ...keywords].filter(Boolean),
        protectedSamples: [transcript, sample].filter(Boolean),
        untrusted: [],
      };
    }

    case "lst_mcq_multi":
    case "lst_mcq_single":
    case "lst_hcs":
    case "lst_smw": {
      const transcript = clean(question.data.transcript);
      const options = question.data.options.map(clean).filter(Boolean);
      const questionText = "question" in question.data ? clean(question.data.question) : "";
      const indexes = Array.isArray(question.data.answer)
        ? question.data.answer
        : [question.data.answer];
      const correct = optionTexts(question.data.options, indexes);
      return {
        hasReference: transcript.length > 0,
        judgeReference: [transcript, ...correct].filter(Boolean),
        protectedSamples: [transcript, ...correct].filter(Boolean),
        untrusted: [
          ...(questionText ? [{ label: "PERGUNTA", content: questionText }] : []),
          ...(options.length > 0 ? [{ label: "OPCOES", content: options.join("\n") }] : []),
        ],
      };
    }

    case "lst_fib": {
      const template = clean(question.data.template);
      const answers = question.data.answers.map(clean).filter(Boolean);
      return {
        hasReference: answers.length > 0,
        judgeReference: answers,
        protectedSamples: answers,
        untrusted: template ? [{ label: "TEXTO_COM_LACUNAS", content: template }] : [],
      };
    }

    case "lst_hiw": {
      const spoken = clean(question.data.spoken);
      const shown = clean(question.data.shown);
      return {
        hasReference: spoken.length > 0,
        judgeReference: spoken ? [spoken] : [],
        protectedSamples: spoken ? [spoken] : [],
        untrusted: shown ? [{ label: "TEXTO_EXIBIDO", content: shown }] : [],
      };
    }

    case "wfd": {
      const sentence = clean(question.data.sentence);
      return {
        hasReference: sentence.length > 0,
        judgeReference: sentence ? [sentence] : [],
        protectedSamples: sentence ? [sentence] : [],
        untrusted: [],
      };
    }
  }
}

/** Referência e contexto de uma questão, já separados por confiança. */
export function referenceForQuestion(question: Question): QuestionReference {
  return buildFor(question);
}

/** Monta o bloco "resposta do aluno" no fim do conteúdo não confiável. */
export function withStudentResponse(
  untrusted: readonly UntrustedPart[],
  responseText: string,
): UntrustedPart[] {
  return [...untrusted, { label: "RESPOSTA_DO_ALUNO", content: responseText }];
}
