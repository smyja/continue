---
title: Configuration
description: Configure your LLM and model provider
keywords: [configure, llm, provider]
---

# Configuration

## Change the default LLM

In `config.json`, you'll find the `models` property, a list of the models that you have saved to use with Continue:

```json
"models": [
    {
        "title": "Smart Model",
        "provider": "openai-free-trial",
        "model": "gpt-4"
    },
    {
        "title": "Fast Model",
        "provider": "openai-free-trial",
        "model": "gpt-3.5-turbo"
    }
]
```

Just by specifying the `model` and `provider` properties, we will automatically detect prompt templates and other important information, but if you're looking to do something beyond this basic setup, we'll explain a few other options below.

## Azure OpenAI Service

If you'd like to use OpenAI models but are concerned about privacy, you can use the Azure OpenAI service, which is GDPR and HIPAA compliant. After applying for access [here](https://azure.microsoft.com/en-us/products/ai-services/openai-service), you will typically hear back within only a few days. Once you have access, set up a model in `config.json` like so:

```json
"models": [{
    "title": "Azure OpenAI",
    "provider": "openai",
    "model": "gpt-4",
    "apiBase": "https://my-azure-openai-instance.openai.azure.com/",
    "engine": "my-azure-openai-deployment",
    "apiVersion": "2023-07-01-preview",
    "apiType": "azure",
    "apiKey": "<MY_API_KEY>"
}]
```

The easiest way to find this information is from the chat playground in the Azure OpenAI portal. Under the "Chat Session" section, click "View Code" to see each of these parameters.

## Self-hosting an open-source model

For many cases, either Continue will have a built-in provider or the API you use will be OpenAI-compatible, in which case you can use the "openai" provider and change the "baseUrl" to point to the server.

However, if neither of these are the case, you will need to wire up a new LLM object. Learn how to do this [here](#defining-a-custom-llm-provider).

## Customizing the Chat Template

Most open-source models expect a specific chat format, for example llama2 and codellama expect the input to look like `"[INST] How do I write bubble sort in Rust? [/INST]"`. Continue will automatically attempt to detect the correct prompt format based on the `model`value that you provide, but if you are receiving nonsense responses, you can use the`template`property to explicitly set the format that you expect. The options are:`["llama2", "alpaca", "zephyr", "phind", "anthropic", "chatml"]`.

If you want to create an entirely new chat template, this can be done in [config.ts](../customization/code-config.md) by defining a function and adding it to the `templateMessages` property of your `LLM`. Here is an example of `templateMessages` for the Alpaca/Vicuna format:

```python
def template_alpaca_messages(msgs: List[Dict[str, str]]) -> str:
    prompt = ""

    if msgs[0]["role"] == "system":
        prompt += f"{msgs[0]['content']}\n"
        msgs.pop(0)

    prompt += "### Instruction:\n"
    for msg in msgs:
        prompt += f"{msg['content']}\n"

    prompt += "### Response:\n"

    return prompt
```

It can then be used like this:

```python title="~/.continue/config.py"
def modify_config(config: ContinueConfig) -> ContinueConfig:
    config.models.default.template_messages = template_alpaca_messages
    return config
```

This exact function and a few other default implementations are available in [`continuedev.libs.llm.prompts.chat`](https://github.com/continuedev/continue/blob/main/server/continuedev/libs/llm/prompts/chat.py).

## Customizing the /edit Prompt

You also have access to customize the prompt used in the '/edit' slash command. We already have a well-engineered prompt for GPT-4 and sensible defaults for less powerful open-source models, but you might wish to play with the prompt and try to find a more reliable alternative if you are for example getting English as well as code in your output.

To customize the prompt, use the `prompt_templates` property of any `LLM`, which is a dictionary, and set the "edit" key to a template string with Mustache syntax. The 'file_prefix', 'file_suffix', 'code_to_edit', 'context_items', and 'user_input' variables are available in the template. Here is an example (the default for non-GPT-4 models):

````python
"""
[INST] Consider the following code:
```
{{{code_to_edit}}}

```
Edit the code to perfectly satisfy the following user request:
{{{user_input}}}
Output nothing except for the code. No code block, no English explanation, no start/end tags.
[/INST]
"""
````

It can then be used like this in `config.py`:

```python title="~/.continue/config.py"
def modify_config(config: ContinueConfig) -> ContinueConfig:
    config.models.edit.prompt_templates["edit"] = "<INSERT_TEMPLATE_HERE>"
    return config
```

A few pre-made templates are available in [`continuedev.libs.llm.prompts.edit`](https://github.com/continuedev/continue/blob/main/server/continuedev/libs/llm/prompts/edit.py).

## Defining a Custom LLM Provider

If you are using an LLM API that isn't already [supported by Continue](./select-provider.md), and is not an OpenAI-compatible API, you'll need to define a `CustomLLM` object in `config.ts`. This object only requires one of (or both of) a `streamComplete` or `streamChat` function. Here is an example:

```typescript title="~/.continue/config.ts"
export function modifyConfig(config: Config): Config {
  config.models.push({
    options: {
      title: "My Custom LLM",
      model: "mistral-7b",
    },
    streamComplete: async function* (prompt, options) {
      // Make the API call here

      // Then yield each part of the completion as it is streamed
      // This is a toy example that will count to 10
      for (let i = 0; i < 10; i++) {
        yield `- ${i}\n`;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    },
  });
}
```
