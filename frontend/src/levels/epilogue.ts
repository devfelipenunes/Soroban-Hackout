import type { Language } from "../i18n/translate.ts";

export type FinalText = Readonly<Record<Language, string>>;
export type FinalSpeaker = "system" | "mara" | "breaker" | "voss" | "architect";
export type FinalScene = {
  id: string;
  code: string;
  title: FinalText;
  lines: readonly { speaker: FinalSpeaker; text: FinalText }[];
  terminal?: readonly string[];
  gallery?: readonly number[];
};
export const FINAL_SPEAKER: Record<FinalSpeaker, string> = {
  system: "SYSTEM", mara: "MARA VALE", breaker: "BREAKER", voss: "AREN VOSS", architect: "THE ARCHITECT",
};

export const FINAL_SCENES: readonly FinalScene[] = [
  {
    "id": "architect-result",
    "code": "CASE 12 // THE ARCHITECT",
    "title": {
      "pt-BR": "A prova não era uma chave",
      "en": "Proof was not a key",
          "es": "La prueba no era una llave"
    },
    "lines": [
      {
        "speaker": "system",
        "text": {
          "pt-BR": "Três fragmentos públicos reconstruíram a evidência desta instância. A assinatura de Voss confirmou o manifesto histórico; o endereço, a rede e o jogador ficaram presos ao contexto atual.",
          "en": "Three public fragments reconstructed this instance's evidence. Voss's signature authenticated the historical manifest; the address, network, and player remained bound to the present context.",
          "es": "Tres fragmentos públicos reconstruyeron la evidencia de esta instancia. La firma de Voss autenticó el manifiesto histórico; la dirección, la red y el jugador quedaron vinculados al contexto actual."
        }
      },
      {
        "speaker": "breaker",
        "text": {
          "pt-BR": "A falha do Decoder foi tratada como prova. Não porque Voss a assinou, mas porque alguém aceitou uma rejeição como resposta.",
          "en": "The Decoder's failure was treated as proof. Not because Voss signed it, but because someone accepted rejection as an answer.",
          "es": "El fallo del Decoder se tomó como prueba. No porque Voss lo hubiera firmado, sino porque alguien aceptó un rechazo como respuesta."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "A operação de diagnóstico amadureceu. O payload foi reescrito para uma sessão de outro dono; a falha da chamada interna ficou armada, e a sessão forense foi aberta para o Breaker. SEQUENCE OBSERVER / ATTESTATION: INDEPENDENT.",
          "en": "The diagnostic operation matured. Its payload was rewritten into a session for another owner; the failed internal call stayed armed, and the forensic session was opened for the Breaker. SEQUENCE OBSERVER / ATTESTATION: INDEPENDENT.",
          "es": "La operación de diagnóstico llegó a su plazo. Su payload se reescribió para abrir una sesión a nombre de otra persona; el fallo de la llamada interna quedó registrado y Breaker abrió su propia sesión forense. SEQUENCE OBSERVER / ATTESTATION: INDEPENDENT."
        }
      }
    ],
    "terminal": ["HISTORICAL SIGNATURE: VERIFIED", "FORENSIC SESSION: OPEN", "SOURCE: SEQUENCE OBSERVER"]
  },
  {
    "id": "silence",
    "code": "FINAL BOSS // THE ARCHITECT",
    "title": {
      "pt-BR": "Ele recusou",
      "en": "He refused",
          "es": "Se negó"
    },
    "lines": [
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Você demorou mais que Voss.",
          "en": "You took longer than Voss.",
          "es": "Tardaste más que Voss."
        }
      },
      {
        "speaker": "breaker",
        "text": {
          "pt-BR": "Onde está Voss?",
          "en": "Where is Voss?",
          "es": "¿Dónde está Voss?"
        }
      },
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Ele chegou até esta sala.",
          "en": "He reached this room.",
          "es": "Llegó hasta esta sala."
        }
      },
      {
        "speaker": "breaker",
        "text": {
          "pt-BR": "E?",
          "en": "And?",
          "es": "¿Y?"
        }
      },
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Ele recusou.",
          "en": "He refused.",
          "es": "Se negó."
        }
      },
      {
        "speaker": "breaker",
        "text": {
          "pt-BR": "Recusou o quê?",
          "en": "Refused what?",
          "es": "¿A qué se negó?"
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "Nenhuma resposta. O registro de acesso de Voss antecede o incidente do Vault em anos.",
          "en": "No answer. Voss’s access record precedes the Vault incident by years.",
          "es": "No hay respuesta. El registro de acceso de Voss es de varios años antes del incidente del Vault."
        }
      }
    ]
  },
  {
    "id": "sequence",
    "code": "FINAL BOSS // THE ARCHITECT",
    "title": {
      "pt-BR": "Meridian já estava quebrada",
      "en": "Meridian was already broken",
          "es": "Meridian ya estaba rota"
    },
    "lines": [
      {
        "speaker": "breaker",
        "text": {
          "pt-BR": "Você construiu tudo isso.",
          "en": "You built all of this.",
          "es": "Tú construiste todo esto."
        }
      },
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Não. Eu não quebrei Meridian. Eu a encontrei quebrada.",
          "en": "No. I did not break Meridian. I found it broken.",
          "es": "No. Yo no rompí Meridian. La encontré rota."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "As datas de implantação e os relatórios legados antecedem a Sequence. A cronologia pode ser confrontada com os arquivos de Voss; a explicação não depende apenas da voz do Architect.",
          "en": "Deployment dates and legacy reports precede the Sequence. The timeline can be compared with Voss’s files; the explanation does not depend only on the Architect’s voice.",
          "es": "Las fechas de despliegue y los informes heredados son anteriores a la Sequence. La cronología puede contrastarse con los archivos de Voss; la explicación no depende solo de la voz de The Architect."
        }
      },
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Eu construí a Sequence. Voss aprendeu a atravessá-la. Depois ele deixou uma trilha.",
          "en": "I built the Sequence. Voss learned to cross it. Then he left a trail.",
          "es": "Yo construí la Sequence. Voss aprendió a atravesarla. Después dejó un rastro."
        }
      }
    ]
  },
  {
    "id": "escrow",
    "code": "FINAL BOSS // THE ARCHITECT",
    "title": {
      "pt-BR": "A primeira transação",
      "en": "The first transaction",
          "es": "La primera transacción"
    },
    "lines": [
      {
        "speaker": "system",
        "text": {
          "pt-BR": "A reconstrução do caso une SERVICE_GATE_OPEN → RECOVERY_ROUTED → ESCROW_CREDITED. Destino: Meridian Recovery Escrow, fixado pela rota institucional de recuperação.",
          "en": "The case reconstruction connects SERVICE_GATE_OPEN → RECOVERY_ROUTED → ESCROW_CREDITED. Destination: Meridian Recovery Escrow, fixed by the institutional recovery route.",
          "es": "La reconstrucción del caso enlaza SERVICE_GATE_OPEN → RECOVERY_ROUTED → ESCROW_CREDITED. Destino: Meridian Recovery Escrow, fijado por la ruta institucional de recuperación."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "O dossiê confronta o ator autenticado, o registro institucional de Voss, a escrita da rota 17 e a leitura do RecoveryController. Só essa cadeia — assinatura, identidade temporal, causalidade e política do Escrow — pode liberar ATTRIBUTION VERIFIED. Elias continua sendo metadado de operador, não destinatário dos 2,4 milhões.",
          "en": "The dossier confronts the authenticated actor, Voss’s institutional record, route 17’s write, and RecoveryController’s read. Only that chain — signature, temporal identity, causality, and Escrow policy — may release ATTRIBUTION VERIFIED. Elias remains operator metadata, not the recipient of the 2.4 million.",
          "es": "El expediente contrasta al actor autenticado, el registro institucional de Voss, la escritura de la ruta 17 y la lectura de RecoveryController. Solo esa cadena —firma, identidad temporal, causalidad y política del Escrow— puede habilitar ATTRIBUTION VERIFIED. Elias sigue siendo un dato del operador, no el destinatario de los 2,4 millones."
        }
      },
      {
        "speaker": "breaker",
        "text": {
          "pt-BR": "Então ele não pegou o dinheiro para si.",
          "en": "So he did not take the money for himself.",
          "es": "Entonces no se quedó con el dinero."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "REGISTRO CIVIL / LOWER MERIDIAN: a quarentena deixou recursos indisponíveis e a ordem de serviço de Lower Meridian aguardou liberação. Não enriquecer não significa não causar dano. O canal de Mara já está encerrado.",
          "en": "CIVIL RECORD / LOWER MERIDIAN: quarantine left resources unavailable and Lower Meridian’s service order awaited release. Not getting rich does not mean causing no harm. Mara’s channel is already closed.",
          "es": "CIVIL RECORD / LOWER MERIDIAN: la cuarentena dejó recursos fuera de servicio y la orden de mantenimiento de Lower Meridian quedó pendiente de autorización. No enriquecerse no significa no causar daño. El canal de Mara ya está cerrado."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "O destino público podia ser investigado antes. O que esta reconstrução acrescenta é autoria, política de gasto, intenção e custo. O roubo era uma mensagem impossível de ignorar.",
          "en": "The public destination could be investigated earlier. This reconstruction adds authorship, spending policy, intent, and cost. The theft was a message impossible to ignore.",
          "es": "El destino público ya podía investigarse. Esta reconstrucción añade autoría, política de gasto, intención y costo. El robo era un mensaje imposible de ignorar."
        }
      }
    ],
    "terminal": [
      "SOURCE: MERIDIAN VAULT",
      "DESTINATION: MERIDIAN RECOVERY ESCROW",
      "BENEFICIARY: NONE",
      "VOSS SPEND AUTHORITY: NONE",
      "ATTRIBUTION: PENDING FORENSIC G0–G6"
    ]
  },
  {
    "id": "profile",
    "code": "FINAL BOSS // THE ARCHITECT",
    "title": {
      "pt-BR": "O registro da investigação",
      "en": "The investigation record",
          "es": "El registro de la investigación"
    },
    "lines": [
      {
        "speaker": "system",
        "text": {
          "pt-BR": "Elias: controle assumido e explicitamente liberado. Ghost Key: transferência irregular, hash e custódia documentados. Sector 13: falha provocada e pressão adicional interrompida. Spire: recibo de Mara assinado depois do encerramento.",
          "en": "Elias: control assumed and explicitly released. Ghost Key: improper transfer, documented hash and custody. Sector 13: failure caused and additional pressure stopped. Spire: Mara’s receipt signed after closure.",
          "es": "Elias: control asumido y liberado explícitamente. Ghost Key: transferencia irregular, hash y custodia documentados. Sector 13: fallo provocado y presión adicional detenida. The Spire: recibo de Mara firmado después del cierre."
        }
      },
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Você veio até aqui procurando um ladrão. Quantos sistemas você quebrou para encontrá-lo?",
          "en": "You came here looking for a thief. How many systems did you break to find him?",
          "es": "Viniste buscando a un ladrón. ¿Cuántos sistemas rompiste para encontrarlo?"
        }
      },
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Por que você continuou?",
          "en": "Why did you continue?",
          "es": "¿Por qué seguiste?"
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "O Breaker permanece em silêncio diante dos acontecimentos. O Profile registra fatos fixos; não calcula moralidade nem oferece uma resposta correta.",
          "en": "The Breaker remains silent before the events. The Profile records fixed facts; it neither calculates morality nor offers a correct answer.",
          "es": "Breaker guarda silencio ante lo ocurrido. El Profile registra hechos; no calcula la moral ni ofrece una respuesta correcta."
        }
      }
    ]
  }
];

export const FINAL_AFTER: readonly FinalScene[] = [
  {
    "id": "layer-two",
    "code": "SEQUENCE 01",
    "title": {
      "pt-BR": "Acesso provisório",
      "en": "Provisional access",
          "es": "Acceso provisional"
    },
    "lines": [
      {
        "speaker": "architect",
        "text": {
          "pt-BR": "Meridian sobrevive porque as pessoas obedecem aos contratos. Agora você sabe o quanto eles são frágeis. Ainda acredita que deveriam obedecê-los?",
          "en": "Meridian survives because people obey contracts. Now you know how fragile they are. Do you still believe they should obey them?",
          "es": "Meridian sigue en pie porque la gente obedece los contratos. Ahora sabes lo frágiles que son. ¿Todavía crees que deberían obedecerlos?"
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "QUALIFIED / PROVISIONAL confirma capacidade técnica. Não significa ACCEPTED, consentimento ou legitimidade para intervir.",
          "en": "QUALIFIED / PROVISIONAL confirms technical capacity. It does not mean ACCEPTED, consent, or legitimacy to intervene.",
          "es": "QUALIFIED / PROVISIONAL confirma capacidad técnica. No significa ACCEPTED, consentimiento ni legitimidad para intervenir."
        }
      },
    ],
    "terminal": [
      "SEQUENCE 01 COMPLETE",
      "12 CONTRATOS QUEBRADOS // 13 CASOS ENCERRADOS",
      "12 CONTRACTS BROKEN // 13 CASES CLOSED",
      "SUBJECT: QUALIFIED",
      "STATUS: PROVISIONAL",
      "ACCESS GRANTED: LAYER II"
    ]
  },
  {
    "id": "mara",
    "code": "EPÍLOGO",
    "title": {
      "pt-BR": "O preço da assinatura",
      "en": "The price of a signature",
          "es": "El precio de una firma"
    },
    "lines": [
      {
        "speaker": "system",
        "text": {
          "pt-BR": "INTERNAL REVIEW / SUBJECT: MARA VALE / CREDENTIALS: SUSPENDED / CASE ACCESS: REVOKED.",
          "en": "INTERNAL REVIEW / SUBJECT: MARA VALE / CREDENTIALS: SUSPENDED / CASE ACCESS: REVOKED.",
          "es": "INTERNAL REVIEW / SUBJECT: MARA VALE / CREDENTIALS: SUSPENDED / CASE ACCESS: REVOKED."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "O recibo assinado após CASE TERMINATED tornou a prova auditável e a desobediência verificável. A Authority não precisou espionar o canal privado. Mara não responde.",
          "en": "The receipt signed after CASE TERMINATED made the evidence auditable and the disobedience verifiable. The Authority did not need to spy on the private channel. Mara does not answer.",
          "es": "El recibo firmado después de CASE TERMINATED hizo que la evidencia pudiera auditarse y la desobediencia, comprobarse. La Authority no necesitó espiar el canal privado. Mara no responde."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "Meridian continua funcionando. O Breaker já não confunde execução aceita com autorização ou legitimidade. Voss permanece ausente; a razão completa de sua recusa ainda não foi reconstruída.",
          "en": "Meridian keeps running. The Breaker no longer confuses accepted execution with authorization or legitimacy. Voss remains absent; the full reason for his refusal has not yet been reconstructed.",
          "es": "Meridian sigue funcionando. Breaker ya no confunde una ejecución aceptada con autorización o legitimidad. Voss sigue ausente; todavía no se ha reconstruido por completo el motivo de su negativa."
        }
      }
    ]
  },
  {
    "id": "lumen",
    "code": "PÓS-CRÉDITOS // LUMEN",
    "title": {
      "pt-BR": "Outro terminal",
      "en": "Another terminal",
          "es": "Otro terminal"
    },
    "lines": [
      {
        "speaker": "system",
        "text": {
          "pt-BR": "Em Lumen, um terminal recebe SUBJECT: QUALIFIED / STATUS: PROVISIONAL / NEW BREAKER DETECTED. Uma figura permanece fora de quadro, sem rosto ou identidade revelados.",
          "en": "In Lumen, a terminal receives SUBJECT: QUALIFIED / STATUS: PROVISIONAL / NEW BREAKER DETECTED. A figure remains out of frame, with no face or identity revealed.",
          "es": "En Lumen, un terminal recibe SUBJECT: QUALIFIED / STATUS: PROVISIONAL / NEW BREAKER DETECTED. Una figura permanece fuera de cuadro; no se distinguen su rostro ni su identidad."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "“Então ele encontrou outro.” A tela apaga.",
          "en": "“So he found another.” The screen goes dark.",
          "es": "«Entonces encontró a otra persona». La pantalla se apaga."
        }
      },
      {
        "speaker": "system",
        "text": {
          "pt-BR": "END OF SEQUENCE 01. THE FIRST LAYER — COMPLETE.",
          "en": "END OF SEQUENCE 01. THE FIRST LAYER — COMPLETE.",
          "es": "END OF SEQUENCE 01. THE FIRST LAYER — COMPLETE."
        }
      }
    ]
  }
];
