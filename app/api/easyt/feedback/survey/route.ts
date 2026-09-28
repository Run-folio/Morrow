import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getContextualFeedbackState, dismissContextualFeedback, submitContextualFeedback } from "@/lib/easyt/repository";
import { handleContextualFeedbackSurvey } from "@/lib/easyt/feedback-survey-api";

export const dynamic = "force-dynamic";
const dependencies = {
  owner: requireEasyTOwner,
  state: getContextualFeedbackState,
  dismiss: dismissContextualFeedback,
  submit: submitContextualFeedback,
};
export const GET = (request: Request) => handleContextualFeedbackSurvey(request, dependencies);
export const PATCH = (request: Request) => handleContextualFeedbackSurvey(request, dependencies);
export const POST = (request: Request) => handleContextualFeedbackSurvey(request, dependencies);
