import React, { useState, useCallback, useEffect } from 'react';
import { UploadCloud, Utensils, AlertCircle, Loader2, Image as ImageIcon, Lightbulb, ChefHat, Sparkles } from 'lucide-react';
import Auth from './auth';
import { supabase } from './supabaseClient';


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
  const [recipeIdea, setRecipeIdea] = useState(null); // Will store { itemName: '...', idea: {...} }
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);
  const [recipeError, setRecipeError] = useState(null);
  const [currentItemForRecipe, setCurrentItemForRecipe] = useState(null);

  // State for Totals
  const [todayTotal, setTodayTotal] = useState(null);
  const [weekTotal, setWeekTotal] = useState(null);
  const [isLoadingTotals, setIsLoadingTotals] = useState(false);
  const [totalsError, setTotalsError] = useState(null);
 
  // User state
  const [user, setUser] = useState(null);

  // Check auth state on mount
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user || null);
    };
    getUser();

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, []);
  
  // Time Helper Function for Asia/Singapore

  const TZ = "Asia/Singapore";

  function dateKeyInTz(d) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const get = t => parts.find(p => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function mondayKeyThisWeek() {
    const nowKey = dateKeyInTz(new Date());
    const [y, m, d] = nowKey.split('-').map(Number);
    const localMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const dow = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(localMidnight);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const offsetDays = map[dow];
    const daysFromMonday = (offsetDays + 6) % 7;
    const mondayUTC = new Date(localMidnight.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
    return dateKeyInTz(mondayUTC);
  }
  
  //FetchTotals - fetch and set today's and this week's totals

  const fetchTotals = useCallback(async () => {
  setIsLoadingTotals(true);
  setTotalsError(null);

  try {
    // Get today and Monday in Singapore timezone
    const todayKey = dateKeyInTz(new Date());
    const mondayKey = mondayKeyThisWeek();

    // Get 8 days ago in Singapore timezone
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();

    // Fetch rows from Supabase
    const { data, error } = await supabase
      .from('foods_consumed')
      .select('*')
      .gte('eaten_at', sevenDaysAgoIso);

    if (error) throw error;

    // Group and sum by Singapore day
    const dayTotals = {};
    let weekTotalSum = 0;
    let todayTotalSum = 0;

    data.forEach(row => {
      const dayKey = dateKeyInTz(new Date(row.eaten_at));
      dayTotals[dayKey] = (dayTotals[dayKey] || 0) + Number(row.calories);

      // Sum for today
      if (dayKey === todayKey) todayTotalSum += Number(row.calories);

      // Sum for this week (from Monday)
      if (dayKey >= mondayKey && dayKey <= todayKey) weekTotalSum += Number(row.calories);
    });

    setTodayTotal(todayTotalSum);
    setWeekTotal(weekTotalSum);
  } catch (err) {
    setTotalsError(err.message);
    setTodayTotal(null);
    setWeekTotal(null);
  } finally {
    setIsLoadingTotals(false);
  }
}, []);

  // --- Use fetchTotals in useEffect ---
  useEffect(() => {
    fetchTotals();
  }, [fetchTotals]);

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
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY; // NEW LINE
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const parts = [{ text: prompt }];
    if (inlineData) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg", // Assuming JPEG, could be parameterized if needed
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
    setMealInsights(null); // Reset insights on new analysis
    setRecipeIdea(null); // Reset recipe on new analysis

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

  // Function to save the current analysis to Supabase

  const handleSaveAnalysis = async () => {
  setIsLoadingTotals(true);
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      throw new Error("Not signed in");
    }
    await supabase.from('foods_consumed').insert([{
      user_id: user.id,
      eaten_at: new Date().toISOString(),
      label: analysisResult.foodItems.map(f => f.name).join(', '),
      calories: analysisResult.totalCalories,
      confidence: null,
      raw_model_output: analysisResult
    }]);
    fetchTotals();
  } catch (err) {
    setTotalsError(err.message);
  } finally {
    setIsLoadingTotals(false);
  }
};

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
    setRecipeIdea(null); // Clear previous recipe idea

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

  if (!user) return <Auth />;

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
                <p className="mb-2 text-sm font-semibold">Click to upload or drag and drop</p>
                <p className="text-xs">PNG, JPG, GIF up to 10MB</p>
              </div>
            )}
            <input id="imageUpload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
          </label>
          {selectedImage && (
             <button
                onClick={() => {
                    setSelectedImage(null); setBase64Image(null); setAnalysisResult(null); setError(null);
                    setMealInsights(null); setInsightsError(null); setRecipeIdea(null); setRecipeError(null);
                    const fileInput = document.getElementById('imageUpload');
                    if (fileInput) fileInput.value = null;
                }}
                className="mt-4 w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-300 flex items-center justify-center"
            >
                <ImageIcon className="mr-2 h-5 w-5" /> Clear Image
            </button>
          )}
        </section>

        {/* Analyze Button */}
        {selectedImage && !analysisResult && (
          <section className="mb-8">
            <button
              onClick={analyzeImage}
              disabled={isLoading || !base64Image}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 flex items-center justify-center shadow-lg"
            >
              {isLoading ? <Loader2 className="animate-spin mr-3 h-6 w-6" /> : <Utensils className="mr-3 h-6 w-6" />}
              {isLoading ? "Analyzing..." : "Estimate Calories"}
            </button>
          </section>
        )}

        {/* Error Display for Main Analysis */}
        {error && (
          <section className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md shadow">
            <div className="flex"><AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" /><div><p className="font-bold">Analysis Error</p><p className="text-sm">{error}</p></div></div>
          </section>
        )}
        
        {/* Loading Display for Main Analysis */}
        {isLoading && !error && (
           <div className="text-center p-6">
                <Loader2 className="animate-spin h-12 w-12 text-green-600 mx-auto" />
                <p className="mt-4 text-lg font-semibold text-gray-700">Identifying food and estimating calories...</p>
            </div>
        )}

        {/* --- Results Display Section --- */}
        {analysisResult && !isLoading && !error && (
          <section className="bg-gray-50 p-6 rounded-lg shadow-inner mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center border-b pb-3">Calorie Analysis</h2>
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-green-700 mb-1 text-center">Total Estimated Calories</h3>
              <p className="text-5xl font-bold text-green-600 text-center mb-6">
                {analysisResult.totalCalories !== undefined ? analysisResult.totalCalories.toLocaleString() : 'N/A'}
                <span className="text-2xl text-gray-600"> kcal</span>
              </p>
            </div>

            {analysisResult.foodItems && analysisResult.foodItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-700 mb-4 text-center">Detected Food Items:</h3>
                <ul className="space-y-3">
                  {analysisResult.foodItems.map((item, index) => (
                    <li key={index} className="p-4 bg-white rounded-lg shadow-md flex flex-col sm:flex-row justify-between items-center hover:shadow-lg transition-shadow duration-300 gap-2">
                      <span className="text-lg text-gray-700 capitalize text-center sm:text-left">{item.name || 'Unknown Item'} ({item.calories !== undefined ? item.calories.toLocaleString() : 'N/A'} kcal)</span>
                      <button
                        onClick={() => fetchRecipeIdea(item.name)}
                        disabled={isLoadingRecipe && currentItemForRecipe === item.name}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-3 rounded-md text-sm flex items-center justify-center transition-colors duration-200 disabled:bg-gray-300 w-full sm:w-auto"
                      >
                        {isLoadingRecipe && currentItemForRecipe === item.name ? <Loader2 className="animate-spin mr-1 h-4 w-4" /> : <Sparkles className="mr-1 h-4 w-4" />}
                        Recipe Idea
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {analysisResult && (
  <div className="flex flex-col items-center mt-4">
    <button
      className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-lg transition-all duration-200 shadow-lg disabled:bg-gray-400 flex items-center justify-center"
      onClick={handleSaveAnalysis}
      disabled={isLoadingTotals}
    >
      {isLoadingTotals ? <Loader2 className="animate-spin mr-2 h-5 w-5 inline" /> : null}
      Save Calories
    </button>
  </div>
)}
            {/* --- Calorie Totals Card --- */}
<div className="mt-6 bg-white rounded-lg shadow p-4 flex flex-col items-center">
  <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">Your Calorie Totals</h2>
  <div className="text-green-700 text-lg font-semibold mb-1 text-center">
    Today: <span className="font-bold">{todayTotal ?? 0}</span> kcal
  </div>
  <div className="text-blue-700 text-lg font-semibold mb-1 text-center">
    This Week (Mon - Sun SGT): <span className="font-bold">{weekTotal ?? 0}</span> kcal
  </div>
  {totalsError && (
    <div className="text-red-500 text-sm mt-2 text-center">{totalsError}</div>
  )}
</div>
            {/* Get Meal Insights Button */}
            {!mealInsights && !isLoadingInsights && (
                <button
                  onClick={fetchMealInsights}
                  className="w-full mt-4 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center shadow-lg"
                >
                  <Sparkles className="mr-2 h-6 w-6" /> Get Meal Insights & Alternatives
                </button>
            )}
          </section>
        )}

        {/* --- Meal Insights Section --- */}
        {isLoadingInsights && (
            <div className="text-center p-6 my-4">
                <Loader2 className="animate-spin h-10 w-10 text-purple-600 mx-auto" />
                <p className="mt-3 text-md font-semibold text-gray-700">✨ Generating Meal Insights...</p>
            </div>
        )}
        {insightsError && (
            <section className="my-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md shadow">
                <div className="flex"><AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" /><div><p className="font-bold">Insights Error</p><p className="text-sm">{insightsError}</p></div></div>
            </section>
        )}
        {mealInsights && !isLoadingInsights && (
            <section className="bg-purple-50 p-6 rounded-lg shadow-inner mb-8">
                <h2 className="text-2xl font-semibold text-purple-800 mb-4 text-center flex items-center justify-center"><Lightbulb className="mr-2 h-7 w-7" /> Meal Insights & Alternatives</h2>
                <div className="prose prose-sm sm:prose-base max-w-none">
                    <p className="font-semibold text-purple-700">Summary:</p>
                    <p>{mealInsights.summary || "No summary provided."}</p>
                    
                    {mealInsights.suggestions && mealInsights.suggestions.length > 0 && (
                        <>
                            <p className="font-semibold text-purple-700 mt-4">Suggestions:</p>
                            <ul className="list-disc pl-5 space-y-2">
                                {mealInsights.suggestions.map((sugg, idx) => (
                                    <li key={idx}>
                                        <strong>Alternative for {sugg.originalItem || 'identified aspect'}:</strong> {sugg.suggestion || "N/A"} <br/>
                                        <em>Reason: {sugg.reason || "N/A"}</em>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {(mealInsights.overallAssessment && (!mealInsights.suggestions || mealInsights.suggestions.length === 0))
                        ? ( /* Changed from && to ternary operator */
                            <>
                                <p className="font-semibold text-purple-700 mt-4">Overall:</p>
                                <p>{mealInsights.overallAssessment}</p>
                            </>
                          )
                        : null
                    }
                </div>
            </section>
        )}

        {/* --- Recipe Idea Section --- */}
        {isLoadingRecipe && currentItemForRecipe && (
            <div className="text-center p-6 my-4">
                <Loader2 className="animate-spin h-10 w-10 text-blue-600 mx-auto" />
                <p className="mt-3 text-md font-semibold text-gray-700">✨ Crafting recipe for {currentItemForRecipe}...</p>
            </div>
        )}
        {recipeError && (
            <section className="my-4 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md shadow">
                 <div className="flex"><AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0" /><div><p className="font-bold">Recipe Error</p><p className="text-sm">{recipeError}</p></div></div>
            </section>
        )}
        {recipeIdea && recipeIdea.idea && !isLoadingRecipe && (
            <section className="bg-blue-50 p-6 rounded-lg shadow-inner mb-8">
                <h2 className="text-2xl font-semibold text-blue-800 mb-4 text-center flex items-center justify-center"><ChefHat className="mr-2 h-7 w-7" /> Recipe Idea for {recipeIdea.itemName}</h2>
                <div className="prose prose-sm sm:prose-base max-w-none">
                    <h3 className="text-xl font-bold text-blue-700">{recipeIdea.idea.recipeName || "Tasty Dish"}</h3>
                    <p className="italic">{recipeIdea.idea.description || `A delightful way to prepare ${recipeIdea.itemName}.`}</p>
                    
                    {(recipeIdea.idea.prepTime || recipeIdea.idea.cookTime) && (
                        <p className="text-sm text-gray-600">
                            {recipeIdea.idea.prepTime && <><strong>Prep:</strong> {recipeIdea.idea.prepTime} </>}
                            {recipeIdea.idea.cookTime && <><strong>Cook:</strong> {recipeIdea.idea.cookTime}</>}
                        </p>
                    )}

                    <p className="font-semibold text-blue-700 mt-3">Ingredients:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        {recipeIdea.idea.ingredients && recipeIdea.idea.ingredients.map((ing, idx) => <li key={idx}>{ing}</li>)}
                    </ul>
                    
                    <p className="font-semibold text-blue-700 mt-3">Instructions:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                        {recipeIdea.idea.instructions && recipeIdea.idea.instructions.map((step, idx) => <li key={idx}>{step}</li>)}
                    </ol>
                </div>
            </section>
        )}
        
        <footer className="mt-10 text-center text-xs text-gray-500">
            <p><strong>Disclaimer:</strong> Calorie estimates, nutritional insights, and recipes are provided by an AI model and may not be 100% accurate or complete. This tool is for informational and inspirational purposes only and should not be used for medical dietary guidance.</p>
        </footer>
      </div>
    </div>
  );
}
