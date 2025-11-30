import React from 'react';
import PromptsModalLayout from './PromptsModalLayout';
import RefinePromptsContent from '../../Refine/RefinePromptsContent';
import DeepthinkPromptsContent from '../../Deepthink/DeepthinkPromptsContent';
import ReactPromptsContent from '../../React/ReactPromptsContent';
import AgenticPromptsContent from '../../Agentic/AgenticPromptsContent';
import AdaptivePromptsContent from '../../AdaptiveDeepthink/AdaptivePromptsContent';
import ContextualPromptsContent from '../../Contextual/ContextualPromptsContent';

/**
 * Prompts Modal Manager
 * Orchestrates which mode-specific prompts content to display
 * Note: This component provides the structure for all modal content 
 * The actual modal visibility and navigation is still managed by PromptsModal.ts
 */
export const PromptsModalManager: React.FC = () => {
    return (
        <PromptsModalLayout>
            {/* All mode-specific prompt containers are rendered */}
            {/* The PromptsModal.ts handles showing/hiding based on active mode */}
            <RefinePromptsContent />
            <DeepthinkPromptsContent />
            <ReactPromptsContent />
            <AgenticPromptsContent />
            <AdaptivePromptsContent />
            <ContextualPromptsContent />
        </PromptsModalLayout>
    );
};

export default PromptsModalManager;
