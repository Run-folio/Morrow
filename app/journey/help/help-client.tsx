"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type KeyboardEvent } from "react";
import {
  BookOpenText,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  HeartPulse,
  Link2,
  Mail,
  MapPinned,
  Map as MapIcon,
  NotebookPen,
  Route,
  SearchX,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { EasyTButton, EasyTField, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import {
  allHelpQuestions,
  filterHelpTopics,
  helpTopics,
  popularQuestionIds,
  type HelpQuestion,
  type HelpTopic,
  type HelpTopicIcon,
} from "./help-content";
import styles from "./help.module.css";

const iconByTopic: Record<HelpTopicIcon, LucideIcon> = {
  "getting-started": MapPinned,
  building: NotebookPen,
  routes: Route,
  itinerary: BookOpenText,
  map: MapIcon,
  health: HeartPulse,
  "before-you-go": CalendarCheck2,
  account: UserRound,
  booking: Link2,
  passport: FileCheck2,
  privacy: ShieldCheck,
};

const questionById = new Map(allHelpQuestions(helpTopics).map((question) => [question.id, question]));
const popularQuestions = popularQuestionIds.flatMap((id) => {
  const question = questionById.get(id);
  return question ? [question] : [];
});

function questionMatches(question: HelpQuestion, query: string) {
  const terms = query.toLocaleLowerCase("en").replace(/[’‘]/g, "'").trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const content = [question.title, ...(question.popularAnswer ?? question.answer)]
    .join(" ")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'");
  return terms.every((term) => content.includes(term));
}

function QuestionDisclosure({
  question,
  className,
  initiallyOpen = false,
}: {
  question: HelpQuestion;
  className?: string;
  initiallyOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const answerId = `${question.id}-popular-answer`;
  const answer = question.popularAnswer ?? question.answer;

  return (
    <article className={className} data-open={isOpen ? "true" : "false"}>
      <EasyTButton
        className={styles.questionToggle}
        variant="quiet"
        fullWidth
        aria-expanded={isOpen}
        aria-controls={answerId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={styles.questionTitle}>{question.title}</span>
        <ChevronDown aria-hidden="true" />
      </EasyTButton>
      {isOpen ? (
        <div className={styles.questionAnswer} id={answerId}>
          {answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      ) : null}
    </article>
  );
}

function TopicCard({
  topic,
  selected,
  onSelect,
}: {
  topic: HelpTopic;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = iconByTopic[topic.icon];
  const contentId = `${topic.id}-help-detail`;

  return (
    <article className={styles.topicCard} data-selected={selected ? "true" : "false"}>
      <EasyTButton
        className={styles.topicToggle}
        variant="quiet"
        fullWidth
        aria-expanded={selected}
        aria-controls={contentId}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className={styles.topicIcon}><Icon aria-hidden="true" /></span>
        <span className={styles.topicSummaryCopy}>
          <span className={styles.topicTitle}>{topic.title}</span>
          <span>{topic.description}</span>
        </span>
        {selected
          ? <ChevronDown className={styles.topicChevron} aria-hidden="true" />
          : <ChevronRight className={styles.topicChevron} aria-hidden="true" />}
      </EasyTButton>
    </article>
  );
}

function TopicDetail({ topic, onClose }: { topic: HelpTopic; onClose: () => void }) {
  const Icon = iconByTopic[topic.icon];
  const titleId = `${topic.id}-detail-title`;

  return (
    <section
      className={styles.topicDetailPanel}
      id={`${topic.id}-help-detail`}
      aria-labelledby={titleId}
    >
      <header className={styles.topicDetailHeader}>
        <span className={styles.topicIcon}><Icon aria-hidden="true" /></span>
        <div>
          <p>HELP TOPIC</p>
          <h3 id={titleId}>{topic.title}</h3>
          <span>{topic.description}</span>
        </div>
        <EasyTButton
          className={styles.topicDetailClose}
          variant="quiet"
          icon={X}
          iconOnly
          aria-label={`Close ${topic.title} help`}
          onClick={onClose}
        >
          Close {topic.title} help
        </EasyTButton>
      </header>
      <div className={styles.topicQuestions}>
        {topic.questions.map((question) => (
          <article key={question.id} id={question.id}>
            <h4>{question.title}</h4>
            {question.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </article>
        ))}
      </div>
      {topic.links?.length ? (
        <nav className={styles.topicLinks} aria-label={`${topic.title} links`}>
          {topic.links.map((link) => (
            <Link href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

export type HelpCenterProps = {
  initialOpenQuestion?: string;
  initialOpenTopic?: string;
  initialQuery?: string;
};

export default function HelpCenter({
  initialOpenQuestion,
  initialOpenTopic,
  initialQuery = "",
}: HelpCenterProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialOpenTopic ?? null);
  const filteredTopics = useMemo(() => filterHelpTopics(helpTopics, query), [query]);
  const filteredPopularQuestions = useMemo(
    () => popularQuestions.filter((question) => questionMatches(question, query)),
    [query],
  );
  const selectedTopic = filteredTopics.find((topic) => topic.id === selectedTopicId) ?? null;
  const hasQuery = Boolean(query.trim());

  const clearSearch = () => {
    setQuery("");
    setSelectedTopicId(null);
  };
  const updateQuery = (value: string) => {
    setQuery(value);
    setSelectedTopicId(null);
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      clearSearch();
    }
  };

  return (
    <div className={styles.helpCenter}>
      <section className={styles.hero} aria-labelledby="help-title">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>HELP CENTER</p>
            <h1 id="help-title">How can we help?</h1>
            <p className={styles.heroLede}>Find answers, learn the basics or get the most out of Morrovia.</p>
            <div className={styles.searchBar} role="search">
              <EasyTField
                type="search"
                label="Search Morrovia Help"
                labelClassName="sr-only"
                fieldClassName={styles.searchField}
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search help topics, questions or keywords"
                autoComplete="off"
              />
              {hasQuery ? (
                <EasyTButton variant="secondary" onClick={clearSearch} aria-label="Clear Help search">
                  Clear
                </EasyTButton>
              ) : null}
            </div>
            {hasQuery ? (
              <p className={styles.searchStatus} role="status" aria-live="polite">
                {filteredTopics.length} matching {filteredTopics.length === 1 ? "topic" : "topics"}
              </p>
            ) : null}
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <Image
              src="/journey/illustrations/help-wayfinding-watercolor.png"
              width={1672}
              height={941}
              sizes="(max-width: 700px) calc(100vw - 32px), 390px"
              alt=""
              priority
            />
          </div>
        </div>
      </section>

      <div className={styles.content}>
        {filteredTopics.length ? (
          <>
            <section className={styles.topicsSection} aria-labelledby="help-topics-title">
              <header className={styles.sectionHeading}>
                <div>
                  <p>HELP TOPICS</p>
                  <h2 id="help-topics-title">Browse help topics</h2>
                </div>
                <span>{filteredTopics.length} {filteredTopics.length === 1 ? "topic" : "topics"}</span>
              </header>
              <div className={styles.topicGrid}>
                {filteredTopics.map((topic) => (
                  <TopicCard
                    topic={topic}
                    selected={selectedTopic?.id === topic.id}
                    onSelect={() => setSelectedTopicId((current) => current === topic.id ? null : topic.id)}
                    key={topic.id}
                  />
                ))}
              </div>
              {selectedTopic ? <TopicDetail topic={selectedTopic} onClose={() => setSelectedTopicId(null)} /> : null}
            </section>

            {filteredPopularQuestions.length ? (
              <section className={styles.popularSection} aria-labelledby="popular-questions-title">
                <header className={styles.sectionHeading}>
                  <div>
                    <p>QUICK ANSWERS</p>
                    <h2 id="popular-questions-title">Popular questions</h2>
                  </div>
                </header>
                <div className={styles.popularGrid}>
                  {filteredPopularQuestions.map((question) => (
                    <QuestionDisclosure
                      className={styles.questionDetails}
                      question={question}
                      initiallyOpen={initialOpenQuestion === question.id}
                      key={question.id}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className={styles.emptyState} aria-labelledby="no-help-results">
            <SearchX aria-hidden="true" />
            <div>
              <h2 id="no-help-results">No Help results found</h2>
              <p>Try “route”, “save” or “Needs review”.</p>
            </div>
            <EasyTButton variant="secondary" onClick={clearSearch}>Clear search</EasyTButton>
          </section>
        )}

        <section className={styles.supportPanel} aria-label="Support and travel information">
          <div className={styles.supportBlock}>
            <span className={styles.supportIcon}><CircleHelp aria-hidden="true" /></span>
            <div>
              <p className={styles.supportEyebrow}>MORROVIA SUPPORT</p>
              <h2>Still stuck?</h2>
              <p>If something isn’t working or you’re unsure what Morrovia means, get in touch.</p>
              <EasyTLinkButton href={`mailto:${morroviaLegalIdentity.supportContact}`} icon={Mail} variant="secondary">
                Email Morrovia support
              </EasyTLinkButton>
            </div>
          </div>
          <div className={styles.disclaimerBlock}>
            <span className={styles.supportIcon}><FileCheck2 aria-hidden="true" /></span>
            <div>
              <p className={styles.supportEyebrow}>IMPORTANT INFORMATION</p>
              <h2>Travel info disclaimer</h2>
              <p>Entry requirements and travel information can change. Check important details with official sources before you travel.</p>
              <Link href="/journey/passport">Open Passport information</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
