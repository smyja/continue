import { Dispatch } from "@reduxjs/toolkit";

import { ChatHistory, ChatHistoryItem, ChatMessage, SlashCommand } from "core";
import { ExtensionIde } from "core/ide";
import { constructMessages } from "core/llm/constructMessages";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { defaultModelSelector } from "../redux/selectors/modelSelectors";
import {
  addContextItems,
  addLogs,
  resubmitAtIndex,
  setInactive,
  streamUpdate,
  submitMessage,
} from "../redux/slices/stateSlice";
import { RootStore } from "../redux/store";
import { errorPopup } from "../util/ide";

function useChatHandler(dispatch: Dispatch) {
  const posthog = usePostHog();

  const defaultModel = useSelector(defaultModelSelector);

  const slashCommands = useSelector(
    (store: RootStore) => store.state.config.slashCommands || []
  );

  const contextItems = useSelector(
    (store: RootStore) => store.state.contextItems
  );
  const history = useSelector((store: RootStore) => store.state.history);

  const active = useSelector((store: RootStore) => store.state.active);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  async function _streamNormalInput(messages: ChatMessage[]) {
    for await (const update of defaultModel.streamChat(messages)) {
      if (!activeRef.current) {
        break;
      }
      dispatch(streamUpdate(update.content));
    }
  }

  const getSlashCommandForInput = (
    input: string
  ): [SlashCommand, string] | undefined => {
    let slashCommand: SlashCommand | undefined;
    let slashCommandName: string | undefined;
    if (input.startsWith("/")) {
      slashCommandName = input.split(" ")[0].substring(1);
      slashCommand = slashCommands.find(
        (command) => command.name === slashCommandName
      );
    }
    if (!slashCommand || !slashCommandName) {
      return undefined;
    }

    // Convert to actual slash command object with runnable function
    return [slashCommand, input];
  };

  async function _streamSlashCommand(
    messages: ChatMessage[],
    slashCommand: SlashCommand,
    input: string
  ) {
    const sdk = {
      input,
      history: messages,
      ide: new ExtensionIde(),
      llm: defaultModel,
      addContextItem: (item) => {
        dispatch(addContextItems([item]));
      },
      contextItems,
      params: slashCommand.params,
    };

    // TODO: if the model returned fast enough it would immediately break
    // Ideally you aren't trusting that results of dispatch show up before the first yield
    for await (const update of slashCommand.run(sdk)) {
      if (!activeRef.current) {
        break;
      }
      if (typeof update === "string") {
        dispatch(streamUpdate(update));
      }
    }
  }

  async function streamResponse(input: string, index?: number) {
    try {
      const message: ChatMessage = {
        role: "user",
        content: input,
      };
      const historyItem: ChatHistoryItem = {
        message,
        contextItems:
          typeof index === "number"
            ? history[index].contextItems
            : contextItems,
      };

      let newHistory: ChatHistory = [];
      if (typeof index === "number") {
        newHistory = [...history.slice(0, index), historyItem];
        dispatch(resubmitAtIndex({ index, content: input }));
      } else {
        newHistory = [...history, historyItem];
        console.log("Submitting message");
        dispatch(submitMessage(message));
      }

      // TODO: hacky way to allow rerender
      await new Promise((resolve) => setTimeout(resolve, 0));

      posthog.capture("step run", {
        step_name: "User Input",
        params: {
          user_input: input,
        },
      });
      posthog.capture("userInput", {
        input,
      });

      const messages = constructMessages(newHistory);

      // Determine if the input is a slash command
      let commandAndInput = getSlashCommandForInput(input);

      const logs = [];
      const writeLog = async (log: string) => {
        logs.push(log);
      };
      defaultModel.writeLog = writeLog;

      if (!commandAndInput) {
        await _streamNormalInput(messages);
      } else {
        const [slashCommand, commandInput] = commandAndInput;
        await _streamSlashCommand(messages, slashCommand, commandInput);
      }

      const pairedLogs = [];
      for (let i = 0; i < logs.length; i += 2) {
        pairedLogs.push([logs[i], logs[i + 1]]);
      }
      dispatch(addLogs(pairedLogs));
    } catch (e) {
      console.log("Continue: error streaming response: ", e);
      errorPopup(`Error streaming response: ${e}`);
    } finally {
      dispatch(setInactive());
      defaultModel.writeLog = undefined;
    }
  }

  return { streamResponse };
}

export default useChatHandler;
