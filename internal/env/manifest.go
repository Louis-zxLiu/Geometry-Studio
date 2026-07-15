package env

type Requirement struct {
	Key                      string   `json:"key"`
	RelativePath             string   `json:"relativePath"`
	AlternativeRelativePaths []string `json:"alternativeRelativePaths,omitempty"`
	Label                    string   `json:"label"`
	ImportName               string   `json:"importName"`
}

func DefaultRequirements() []Requirement {
	return []Requirement{
		{
			Key:                      "python",
			RelativePath:             "python.exe",
			AlternativeRelativePaths: []string{"Scripts/python.exe", "pythonw.exe", "Scripts/pythonw.exe"},
			Label:                    "Python interpreter",
		},
		{
			Key:          "numpy",
			RelativePath: "Lib/site-packages/numpy",
			Label:        "NumPy",
			ImportName:   "numpy",
		},
		{
			Key:          "matplotlib",
			RelativePath: "Lib/site-packages/matplotlib",
			Label:        "Matplotlib",
			ImportName:   "matplotlib",
		},
		{
			Key:          "scipy",
			RelativePath: "Lib/site-packages/scipy",
			Label:        "SciPy",
			ImportName:   "scipy",
		},
		{
			Key:          "pyqt5",
			RelativePath: "Lib/site-packages/PyQt5",
			Label:        "PyQt5",
			ImportName:   "PyQt5",
		},
		{
			Key:          "sympy",
			RelativePath: "Lib/site-packages/sympy",
			Label:        "SymPy",
			ImportName:   "sympy",
		},
		{
			Key:          "pillow",
			RelativePath: "Lib/site-packages/PIL",
			Label:        "Pillow",
			ImportName:   "PIL",
		},
		{
			Key:          "pydantic",
			RelativePath: "Lib/site-packages/pydantic",
			Label:        "Pydantic",
			ImportName:   "pydantic",
		},
		{
			Key:          "openai",
			RelativePath: "Lib/site-packages/openai",
			Label:        "OpenAI",
			ImportName:   "openai",
		},
		{
			Key:          "langchain",
			RelativePath: "Lib/site-packages/langchain",
			Label:        "LangChain",
			ImportName:   "langchain",
		},
		{
			Key:          "langchain-openai",
			RelativePath: "Lib/site-packages/langchain_openai",
			Label:        "LangChain OpenAI",
			ImportName:   "langchain_openai",
		},
		{
			Key:          "langgraph",
			RelativePath: "Lib/site-packages/langgraph",
			Label:        "LangGraph",
			ImportName:   "langgraph",
		},
	}
}
