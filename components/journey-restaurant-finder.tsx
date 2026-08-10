"use client";

import { ArrowUpRight, RotateCcw, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  journeyRestaurants,
  journeyDiningContext,
  type JourneyRestaurant,
  type RestaurantCraving,
  type RestaurantDish,
  type RestaurantMeal,
  type RestaurantPace,
  type RestaurantSpend,
} from "@/lib/journey";
import styles from "@/app/journey/journey.module.css";

type Answers = {
  meal?: RestaurantMeal;
  pace?: RestaurantPace;
  craving?: RestaurantCraving;
  spend?: RestaurantSpend;
  dish?: RestaurantDish;
};
type RestaurantAnswer = RestaurantPace | RestaurantCraving | RestaurantSpend | RestaurantDish;

type SavedDayRestaurant = {
  name: string;
  meal: RestaurantMeal;
};

type SavedTasteFinder = {
  answers?: Answers;
  answersByStop?: Record<string, Answers>;
  selections: Record<string, SavedDayRestaurant>;
};

const tasteFinderStorageKey = "journey:taste-finder:v1";

const questions = [
  { key: "pace" as const, eyebrow: "Then, the pace", title: "How should the meal feel?", options: [{ value: "quick", label: "Quick & easy" }, { value: "relaxed", label: "Take our time" }, { value: "occasion", label: "A trip highlight" }] },
  { key: "craving" as const, eyebrow: "Next, the mood", title: "What sounds best?", options: [{ value: "signature", label: "Local signature" }, { value: "comfort", label: "Comfort food" }, { value: "surprise", label: "Surprise me" }] },
  { key: "spend" as const, eyebrow: "Then, spend", title: "What kind of budget?", options: [{ value: "budget", label: "Keep it cheap" }, { value: "mid", label: "Mid-range" }, { value: "treat", label: "Worth a treat" }] },
] as const;

const dishLabels: Record<RestaurantDish, string> = {
  noodles: "Noodles",
  curry: "Curry",
  sushi: "Sushi",
  rice: "Rice bowls",
  beef: "Beef",
  "dim-sum": "Dim sum",
  local: "Local plates",
};

export function JourneyRestaurantFinder({ stopId, city, dayId, onSelectRestaurant }: {
  stopId: string;
  city: string;
  dayId: string;
  onSelectRestaurant: (restaurant?: JourneyRestaurant, meal?: RestaurantMeal) => void;
}) {
  const restaurants = journeyRestaurants[stopId] ?? [];
  const diningContext = journeyDiningContext[stopId];
  const dayNote = diningContext?.notes[dayId];
  const [answers, setAnswers] = useState<Answers>({});
  const [answersByStop, setAnswersByStop] = useState<Record<string, Answers>>({});
  const [savedSelections, setSavedSelections] = useState<Record<string, SavedDayRestaurant>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [resultIndex, setResultIndex] = useState(0);
  const savedSelection = savedSelections[dayId];
  const activeMeal = savedSelection?.meal ?? answers.meal;
  const mealRestaurants = useMemo(() => activeMeal ? restaurants.filter((restaurant) => restaurant.meal.includes(activeMeal)) : restaurants, [activeMeal, restaurants]);
  const dishOptions = useMemo(() => Array.from(new Set(mealRestaurants.flatMap((restaurant) => restaurant.dish))), [mealRestaurants]);
  const eligibleRestaurants = useMemo(() => answers.dish ? mealRestaurants.filter((restaurant) => restaurant.dish.includes(answers.dish!)) : mealRestaurants, [answers.dish, mealRestaurants]);
  const questionIndex = questions.findIndex((question) => !answers[question.key]);
  const needsDish = !answers.dish || !dishOptions.includes(answers.dish);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(tasteFinderStorageKey);
      if (stored) {
        const saved = JSON.parse(stored) as Partial<SavedTasteFinder> & { selections?: Record<string, SavedDayRestaurant | string> };
        if (saved.answersByStop) setAnswersByStop(saved.answersByStop);
        else if (saved.answers) setAnswersByStop({ [stopId]: saved.answers });
        if (saved.selections) {
          const fallbackMeal = saved.answersByStop?.[stopId]?.meal ?? saved.answers?.meal ?? "dinner";
          setSavedSelections(Object.fromEntries(Object.entries(saved.selections).map(([savedDayId, selection]) => [
            savedDayId,
            typeof selection === "string" ? { name: selection, meal: fallbackMeal } : selection,
          ])));
        }
      }
    } catch {
      // A private browser session can block storage; the finder still works in memory.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(tasteFinderStorageKey, JSON.stringify({ answersByStop, selections: savedSelections } satisfies SavedTasteFinder));
    } catch {
      // Keep the interaction usable even when persistence is unavailable.
    }
  }, [answersByStop, savedSelections, storageReady]);

  useEffect(() => {
    setAnswers(answersByStop[stopId] ?? {});
    setResultIndex(0);
  }, [answersByStop, stopId]);

  useEffect(() => setResultIndex(0), [stopId, dayId]);

  const ranked = useMemo(() => [...eligibleRestaurants].sort((a, b) => {
    const score = (restaurant: JourneyRestaurant) => Number(restaurant.pace.includes(answers.pace!)) * 3
      + Number(restaurant.craving.includes(answers.craving!)) * 2
      + Number(restaurant.spend.includes(answers.spend!)) * 2
      + Number(restaurant.dish.includes(answers.dish!)) * 6
      + Number(restaurant.dayIds?.includes(dayId)) * 9;
    return score(b) - score(a);
  }), [answers, dayId, eligibleRestaurants]);

  const savedRecommendation = savedSelection
    ? restaurants.find((restaurant) => restaurant.name === savedSelection.name)
    : undefined;
  const recommendation = savedRecommendation ?? (restaurants.length && activeMeal && questionIndex === -1 && !needsDish
    ? ranked[resultIndex % ranked.length]
    : undefined);
  const question = restaurants.length && activeMeal && !savedRecommendation ? questions[questionIndex] : undefined;
  const isSavedForDay = Boolean(savedRecommendation);

  // A suggestion should not become part of another day's itinerary merely because
  // the user moved through the timeline. Only explicitly saved choices reach the map.
  useEffect(() => onSelectRestaurant(savedRecommendation, savedSelection?.meal), [onSelectRestaurant, savedRecommendation, savedSelection?.meal]);

  if (!restaurants.length && !dayNote) return null;

  const saveAnswers = (next: Answers) => {
    setAnswers(next);
    setAnswersByStop((current) => ({ ...current, [stopId]: next }));
    setSavedSelections((current) => {
      const updated = { ...current };
      delete updated[dayId];
      return updated;
    });
    setResultIndex(0);
  };
  const choose = (key: keyof Answers, value: RestaurantAnswer) => saveAnswers({ ...answers, [key]: value });
  const chooseMeal = (meal: RestaurantMeal) => saveAnswers({ ...answers, meal, dish: undefined });
  const saveRecommendation = () => {
    if (!recommendation || !activeMeal) return;
    setSavedSelections((current) => ({ ...current, [dayId]: { name: recommendation.name, meal: activeMeal } }));
  };

  return <section className={styles.restaurantFinder} aria-label={`Restaurant finder for ${city}`}>
    <header><span><Utensils /></span><div><small>Taste finder</small><strong>{city}</strong></div></header>
    {dayNote ? <div className={styles.restaurantContext}><b>{diningContext?.base}</b><span>{dayNote}</span></div> : null}
    {!restaurants.length ? <p className={styles.restaurantLocalNote}>This leg is better handled with current local advice than a fixed 2027 restaurant booking.</p> : null}
    {restaurants.length ? <div className={styles.mealPicker}>
      <span>Find a meal</span>
      <div role="group" aria-label="Choose lunch or dinner">
        {(["lunch", "dinner"] as const).map((meal) => <button key={meal} type="button" aria-pressed={activeMeal === meal} onClick={() => chooseMeal(meal)}>{meal}</button>)}
      </div>
    </div> : null}
    {activeMeal && question && !recommendation ? <div className={styles.restaurantQuestion}>
      <p>{question.eyebrow} <b>{questionIndex + 1} / {questions.length + 1}</b></p>
      <h3>{question.title}</h3>
      <div>{question.options.map((option) => <button key={option.value} type="button" onClick={() => choose(question.key, option.value)}>{option.label}</button>)}</div>
    </div> : null}
    {activeMeal && questionIndex === -1 && needsDish && !savedRecommendation ? <div className={styles.restaurantQuestion}>
      <p>Finally, choose a direction <b>{questions.length + 1} / {questions.length + 1}</b></p>
      <h3>What do you actually want to eat?</h3>
      <div className={styles.dishOptions}>{dishOptions.map((dish) => <button key={dish} type="button" onClick={() => choose("dish", dish)}>{dishLabels[dish]}</button>)}</div>
    </div> : null}
    {recommendation ? <article className={styles.restaurantResult}>
      <p><span>{isSavedForDay ? `Your ${activeMeal} pick` : `Suggested ${activeMeal} pick`}</span><b>{isSavedForDay ? "In today’s itinerary ↑" : "Not saved yet"}</b></p>
      <h3>{recommendation.name}</h3>
      <span>{recommendation.area}</span>
      <p className={styles.restaurantFit}>{recommendation.fit}</p>
      <p>{recommendation.summary}</p>
      <dl><dt>Order</dt><dd>{recommendation.order}</dd></dl>
      <div className={styles.restaurantActions}>
        <a href={recommendation.mapsUrl} target="_blank" rel="noreferrer">Open in Maps <ArrowUpRight /></a>
        <button type="button" className={styles.restaurantSave} onClick={saveRecommendation} disabled={isSavedForDay}>{isSavedForDay ? "Saved to itinerary" : "Add to today"}</button>
        {ranked.length > 1 ? <button type="button" onClick={() => { setSavedSelections((current) => { const updated = { ...current }; delete updated[dayId]; return updated; }); setResultIndex((index) => index + 1); }}>{isSavedForDay ? "Change pick" : "Try another"}</button> : null}
        <button type="button" aria-label="Change restaurant preferences" onClick={() => saveAnswers({ meal: activeMeal })}><RotateCcw /></button>
      </div>
      <small>Shortlist for March 2027 — confirm hours closer to travel.</small>
    </article> : null}
  </section>;
}
