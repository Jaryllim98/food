import React, { useState, useCallback } from 'react';
import { UploadCloud, Utensils, AlertCircle, Loader2, Image as ImageIcon, Lightbulb, ChefHat, Sparkles } from 'lucide-react';

// Main App Component
export default function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for Meal Insights
  const [mealInsights, setMealInsights] = useState(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  // State for Recipe Ideas
  const [recipeIdea, setRecipeIdea] = useState(null);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);
  const [recipeError, setRecipeError] = useState(null);
  const [currentItemForRecipe, setCurrentItemForRecipe] = useState(null);

  // Handles file selection and converts image to base64
  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(URL.createObjectURL(file));
      const reader = new FileReader();
      reader.onloadend = () => {
        const fullBase64 = reader.result;
        setBase64Image(fullBase64.split(',')[1]);
      };
      reader.readAsDataURL(file);
      setAnalysisResult(null);
      setError(null);
      setMealInsights(null);
      setInsightsError(null);
      setRecipeIdea(null);
      setRecipeError(null);
      setCurrentItemForRecipe(null);
    }
  };

  const callGeminiAPI = useCallback(async (prompt, schema, inlineData = null) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const parts = [{ text: prompt }];
    if (inlineData) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: inlineData
        }
      });
    }

    const payload = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error Response:", errorData);
      throw new Error(`API request failed with status ${response.status}: ${errorData?.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();

    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      const jsonText = result.candidates[0].content.parts[0].text;
      return JSON.parse(jsonText);
    } else {
      console.error("Unexpected API response structure:", result);
      throw new Error("Failed to parse the API response. The structure was unexpected.");
    }
  }, []);

  // Function to call the Gemini API for image analysis
  const analyzeImage = useCallback(async () => {
    if (!base64Image) {
      setError("Please select an image first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    setMealInsights(null);
    setRecipeIdea(null);

    const prompt = "Analyze the food items in this image. For each distinct food item, provide its name and estimated calorie count. Also, provide the estimated total calories for all items combined. Ensure your response strictly follows the provided JSON schema.";
    const schema = {
      type: "OBJECT",
      properties: {
        foodItems: {
          type: "ARRAY",
          description: "A list of identified food items and their estimated calories.",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: "Name of the food item." },
              calories: { type: "NUMBER", description: "Estimated calories for this item." }
            },
            required: ["name", "calories"]
          }
        },
        totalCalories: { type: "NUMBER", description: "Total estimated calories." }
      },
      required: ["foodItems", "totalCalories"]
    };

    try {
      const parsedJson = await callGeminiAPI(prompt, schema, base64Image);
      setAnalysisResult(parsedJson);
    } catch (err) {
      console.error("Error analyzing image:", err);
      setError(`An error occurred during image analysis: ${err.message}.`);
      setAnalysisResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [base64Image, callGeminiAPI]);

  // Function to get meal insights and alternatives
  const fetchMealInsights = useCallback(async () => {
    if (!analysisResult || !analysisResult.foodItems) {
      setInsightsError("Please analyze an image first to get meal insights.");
      return;
    }
    setIsLoadingInsights(true);
    setInsightsError(null);
    setMealInsights(null);

    const foodItemsDescription = analysisResult.foodItems.map(item => `${item.name} (${item.calories} kcal)`).join(', ');
    const prompt = `Based on the following meal: ${foodItemsDescription}, with a total of ${analysisResult.totalCalories} kcal:
1. Provide a brief (1-2 sentences) nutritional summary.
2. If there are any notably high-calorie items or unhealthy aspects, suggest 1-2 healthier alternatives or modifications. If the meal is generally balanced, state that.
Ensure your response strictly follows the provided JSON schema.`;

    const schema = {
      type: "OBJECT",
      properties: {
        summary: { type: "STRING", description: "Brief nutritional summary of the meal." },
        suggestions: {
          type: "ARRAY",
          description: "Suggestions for healthier alternatives or modifications.",
          items: {
            type: "OBJECT",
            properties: {
              originalItem: { type: "STRING", description: "The original item or aspect being addressed." },
              suggestion: { type: "STRING", description: "The suggested healthier alternative or modification." },
              reason: { type: "STRING", description: "A brief reason for the suggestion." }
            },
            required: ["originalItem", "suggestion", "reason"]
          }
        },
        overallAssessment: { type: "STRING", description: "A general comment if the meal is balanced or no specific high-calorie items to target."}
      },
      required: ["summary"]
    };

    try {
      const parsedJson = await callGeminiAPI(prompt, schema);
      setMealInsights(parsedJson);
    } catch (err) {
      console.error("Error fetching meal insights:", err);
      setInsightsError(`An error occurred while fetching meal insights: ${err.message}.`);
    } finally {
      setIsLoadingInsights(false);
    }
  }, [analysisResult, callGeminiAPI]);

  // Function to get a recipe idea for a specific food item
  const fetchRecipeIdea = useCallback(async (itemName) => {
    if (!itemName) return;
    setCurrentItemForRecipe(itemName);
    setIsLoadingRecipe(true);
    setRecipeError(null);
    setRecipeIdea(null);

    const prompt = `Provide a simple and healthy recipe idea for "${itemName}". The recipe should include a catchy name, a list of common ingredients, and brief, easy-to-follow instructions. Ensure your response strictly follows the provided JSON schema.`;
    const schema = {
      type: "OBJECT",
      properties: {
        recipeName: { type: "STRING", description: "Catchy name for the recipe." },
        description: { type: "STRING", description: "A brief, appetizing description of the recipe." },
        ingredients: {
          type: "ARRAY",
          description: "List of ingredients.",
          items: { type: "STRING" }
        },
        instructions: {
          type: "ARRAY",
          description: "Step-by-step instructions.",
          items: { type: "STRING" }
        },
        prepTime: { type: "STRING", description: "Estimated preparation time." },
        cookTime: { type: "STRING", description: "Estimated cooking time." }
      },
      required: ["recipeName", "description", "ingredients", "instructions"]
    };

    try {
      const parsedJson = await callGeminiAPI(prompt, schema);
      setRecipeIdea({ itemName, idea: parsedJson });
    } catch (err) {
      console.error(`Error fetching recipe for ${itemName}:`, err);
      setRecipeError(`Failed to get recipe for ${itemName}: ${err.message}.`);
    } finally {
      setIsLoadingRecipe(false);
    }
  }, [callGeminiAPI]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-400 via-blue-500 to-purple-600 p-4 sm:p-6 lg:p-8 flex flex-col items-center font-sans">
      <div className="bg-white/90 backdrop-blur-md shadow-2xl rounded-xl p-6 sm:p-8 w-full max-w-2xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800">
            <Utensils className="inline-block mr-3 mb-1 h-10 w-10 text-green-600" />
            Food Calorie Estimator
          </h1>
          <p className="text-gray-600 mt-2 text-lg">Upload a photo, get calorie estimates, insights, and recipe ideas!</p>
        </header>

        {/* Image Upload Section */}
        <section className="mb-8">
          <label
            htmlFor="imageUpload"
            className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-400 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors duration-300"
          >
            {selectedImage ? (
              <img src={selectedImage} alt="Selected food" className="max-h-full max-w-full object-contain rounded-lg" />
            ) : (
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-gray-500">
                <UploadCloud className="w-12 h-12 mb-3" />
                <p className="mb-2 text-sm">Click to upload or drag and drop</p>
                <p className="text-xs">PNG, JPG or JPEG</p>
              </div>
            )}
            <input
              id="imageUpload"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </label>
        </section>

        {/* Analysis Button */}
        <section className="mb-8">
          <button
            onClick={analyzeImage}
            disabled={!base64Image || isLoading}
            className={`w-full py-3 px-4 rounded-lg text-white font-semibold flex items-center justify-center ${
              !base64Image || isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              <>
                <ImageIcon className="mr-2" />
                Analyze Image
              </>
            )}
          </button>
        </section>

        {/* Error Display */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center text-red-600">
              <AlertCircle className="mr-2" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Analysis Results</h2>
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-lg font-medium text-gray-700 mb-2">Identified Items:</h3>
              <ul className="space-y-2">
                {analysisResult.foodItems.map((item, index) => (
                  <li key={index} className="flex justify-between items-center">
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium">{item.calories} kcal</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium text-gray-700">Total Calories:</span>
                  <span className="text-xl font-bold text-blue-600">{analysisResult.totalCalories} kcal</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Meal Insights Section */}
        {analysisResult && (
          <section className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-800">Meal Insights</h2>
              <button
                onClick={fetchMealInsights}
                disabled={isLoadingInsights}
                className={`flex items-center px-4 py-2 rounded-lg text-white ${
                  isLoadingInsights
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isLoadingInsights ? (
                  <>
                    <Loader2 className="animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Lightbulb className="mr-2" />
                    Get Insights
                  </>
                )}
              </button>
            </div>

            {insightsError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center text-red-600">
                  <AlertCircle className="mr-2" />
                  <p>{insightsError}</p>
                </div>
              </div>
            )}

            {mealInsights && (
              <div className="bg-white rounded-lg shadow p-4">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-700 mb-2">Nutritional Summary</h3>
                  <p className="text-gray-600">{mealInsights.summary}</p>
                </div>

                {mealInsights.suggestions && mealInsights.suggestions.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Suggestions</h3>
                    <ul className="space-y-3">
                      {mealInsights.suggestions.map((suggestion, index) => (
                        <li key={index} className="bg-green-50 p-3 rounded-lg">
                          <p className="font-medium text-green-800">{suggestion.originalItem}</p>
                          <p className="text-green-700">{suggestion.suggestion}</p>
                          <p className="text-sm text-green-600 mt-1">{suggestion.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {mealInsights.overallAssessment && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-gray-600">{mealInsights.overallAssessment}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Recipe Ideas Section */}
        {analysisResult && (
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Recipe Ideas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {analysisResult.foodItems.map((item, index) => (
                <button
                  key={index}
                  onClick={() => fetchRecipeIdea(item.name)}
                  disabled={isLoadingRecipe && currentItemForRecipe === item.name}
                  className={`flex items-center justify-center p-4 rounded-lg border ${
                    isLoadingRecipe && currentItemForRecipe === item.name
                      ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                      : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-md'
                  }`}
                >
                  {isLoadingRecipe && currentItemForRecipe === item.name ? (
                    <Loader2 className="animate-spin text-gray-500" />
                  ) : (
                    <>
                      <ChefHat className="mr-2 text-blue-600" />
                      <span className="text-gray-700">{item.name}</span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {recipeError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center text-red-600">
                  <AlertCircle className="mr-2" />
                  <p>{recipeError}</p>
                </div>
              </div>
            )}

            {recipeIdea && (
              <div className="mt-6 bg-white rounded-lg shadow p-4">
                <div className="flex items-center mb-4">
                  <Sparkles className="text-yellow-500 mr-2" />
                  <h3 className="text-xl font-semibold text-gray-800">{recipeIdea.idea.recipeName}</h3>
                </div>
                <p className="text-gray-600 mb-4">{recipeIdea.idea.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Ingredients</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-600">
                      {recipeIdea.idea.ingredients.map((ingredient, index) => (
                        <li key={index}>{ingredient}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">Instructions</h4>
                    <ol className="list-decimal list-inside space-y-2 text-gray-600">
                      {recipeIdea.idea.instructions.map((instruction, index) => (
                        <li key={index}>{instruction}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                {(recipeIdea.idea.prepTime || recipeIdea.idea.cookTime) && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between text-sm text-gray-500">
                      {recipeIdea.idea.prepTime && (
                        <span>Prep Time: {recipeIdea.idea.prepTime}</span>
                      )}
                      {recipeIdea.idea.cookTime && (
                        <span>Cook Time: {recipeIdea.idea.cookTime}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
} 