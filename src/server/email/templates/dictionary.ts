/**
 * Email copy (sk, cs, en). SK is the source text; CS and EN are working translations flagged
 * `needs-review` until a native speaker checks them (brief section 8). The sender confirmation
 * is static on purpose: it holds no user-typed text and no child data (ADR-0001 D5, brief section 7).
 */
import type { Locale } from '../../../shared/enums';

export interface SenderCopy {
  subject: string;
  greeting: string;
  body: string;
  footer: string;
}
export interface AdminCopy {
  subjectInquiry: string;
  subjectApplication: string;
  spamPrefix: string;
  intro: string;
  labels: {
    type: string;
    inquiry: string;
    application: string;
    language: string;
    region: string;
    subject: string;
    grade: string;
    nextStep: string;
    spam: string;
    link: string;
  };
}

export const SENDER: Record<Locale, Record<'contact' | 'application', SenderCopy>> = {
  sk: {
    contact: {
      subject: 'Ďakujeme za vašu správu',
      greeting: 'Dobrý deň,',
      body: 'Ďakujeme, vašu správu sme prijali a čoskoro sa vám ozveme.',
      footer:
        'Toto je automatické potvrdenie. Neobsahuje text vašej správy. Ak ste nám nepísali, môžete ho ignorovať.',
    },
    application: {
      subject: 'Ďakujeme za váš záujem',
      greeting: 'Dobrý deň,',
      body: 'Ďakujeme za váš záujem. Vašu prihlášku sme prijali a ozveme sa vám ohľadom ďalšieho postupu.',
      footer:
        'Toto je automatické potvrdenie. Neobsahuje údaje z prihlášky. Ak ste nám nepísali, môžete ho ignorovať.',
    },
  },
  cs: {
    contact: {
      subject: 'Děkujeme za vaši zprávu',
      greeting: 'Dobrý den,',
      body: 'Děkujeme, vaši zprávu jsme přijali a brzy se vám ozveme.',
      footer:
        'Toto je automatické potvrzení. Neobsahuje text vaší zprávy. Pokud jste nám nepsali, můžete ho ignorovat.',
    },
    application: {
      subject: 'Děkujeme za váš zájem',
      greeting: 'Dobrý den,',
      body: 'Děkujeme za váš zájem. Vaši přihlášku jsme přijali a ozveme se vám ohledně dalšího postupu.',
      footer:
        'Toto je automatické potvrzení. Neobsahuje údaje z přihlášky. Pokud jste nám nepsali, můžete ho ignorovat.',
    },
  },
  en: {
    contact: {
      subject: 'Thank you for your message',
      greeting: 'Hello,',
      body: 'Thank you, we have received your message and will get back to you soon.',
      footer:
        'This is an automatic confirmation. It does not repeat your message. If you did not write to us, you can ignore it.',
    },
    application: {
      subject: 'Thank you for your interest',
      greeting: 'Hello,',
      body: 'Thank you for your interest. We have received your application and will get back to you about the next steps.',
      footer:
        'This is an automatic confirmation. It does not repeat any application details. If you did not write to us, you can ignore it.',
    },
  },
};

export const ADMIN: Record<Locale, AdminCopy> = {
  sk: {
    subjectInquiry: 'Nová správa z kontaktného formulára',
    subjectApplication: 'Nová prihláška',
    spamPrefix: '[Podozrenie na spam] ',
    intro: 'V administrácii je nový záznam. Osobné údaje sú iba tam.',
    labels: {
      type: 'Typ',
      inquiry: 'kontaktná správa',
      application: 'prihláška',
      language: 'Jazyk',
      region: 'Región',
      subject: 'Predmet',
      grade: 'Ročník',
      nextStep: 'Ďalší krok',
      spam: 'Označené ako podozrenie na spam',
      link: 'Záznam',
    },
  },
  cs: {
    subjectInquiry: 'Nová zpráva z kontaktního formuláře',
    subjectApplication: 'Nová přihláška',
    spamPrefix: '[Podezření na spam] ',
    intro: 'V administraci je nový záznam. Osobní údaje jsou pouze tam.',
    labels: {
      type: 'Typ',
      inquiry: 'kontaktní zpráva',
      application: 'přihláška',
      language: 'Jazyk',
      region: 'Region',
      subject: 'Předmět',
      grade: 'Ročník',
      nextStep: 'Další krok',
      spam: 'Označeno jako podezření na spam',
      link: 'Záznam',
    },
  },
  en: {
    subjectInquiry: 'New contact message',
    subjectApplication: 'New application',
    spamPrefix: '[Suspected spam] ',
    intro: 'There is a new record in the admin. Personal data is only there.',
    labels: {
      type: 'Type',
      inquiry: 'contact message',
      application: 'application',
      language: 'Language',
      region: 'Region',
      subject: 'Subject',
      grade: 'Grade',
      nextStep: 'Next step',
      spam: 'Flagged as suspected spam',
      link: 'Record',
    },
  },
};
