# Local Qwen improvement scaffold

This pipeline has no hosted API client, background training, or checkpoint promotion.
It does not read AIRI chat history, screen observations, files, or private memory.

## Prepare a dataset

1. Write synthetic prompts or select public prompts with training rights.
2. Add a reviewed response and its license source to each JSONL record.
3. Give each response a quality score between zero and one.
4. Run the preparation command with a new version directory.

```powershell
python scripts/distillation/prepare-dataset.py scripts/distillation/curated.example.jsonl .local/distillation/datasets/v001
```

The command filters records, removes duplicates, and creates a manifest with the source hash.
The prompt hash selects the evaluation split. Variants of one prompt remain in the same split.
The two example records demonstrate the format. They are too small for training or evaluation.

## Hosted teacher permission

`terms-status.json` records the current review and its sources.
Gemini restricts competing-model development. Google Search grounded results cannot train another model.
NVIDIA trial outputs have evaluation limits and a competing-product restriction.
The preparation command rejects hosted Kimi and Gemini records.

Before a future teacher client exists, obtain applicable written permission or a service agreement that permits this training use.
Record that permission and review the provider terms again.
An open model license does not replace the hosted API terms.
Self-hosted teachers remain an option under their applicable model licenses.

## Train and evaluate later

`training.example.yaml` records the intended QLoRA/SFT configuration and promotion gates.
The file is a design template. It is not a command for a specific trainer.
Set the existing local checkpoint path before selecting a compatible trainer.
Keep personality, silence decisions, tool selection, and screen summaries in the evaluation set.
Run all private evaluations locally.
Compare the candidate with the current checkpoint before manual promotion.
Keep the existing server configuration and checkpoint for rollback.
