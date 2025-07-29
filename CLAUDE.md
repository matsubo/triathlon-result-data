# Claude AI Assistant

## Overview

Claude is an AI assistant created by Anthropic that can help with a wide variety of tasks including code analysis, data processing, documentation, and project management.

## Capabilities in This Project

### Data Analysis
- Analyze triathlon race results from TSV files
- Process weather data and correlate with race performance
- Generate statistical insights from race data across multiple years and locations

### Code Development
- Write Python scripts for data processing and analysis
- Create web applications to visualize race results
- Develop APIs for accessing triathlon data
- Generate test scripts for data validation

### Documentation
- Create comprehensive README files
- Generate API documentation
- Write data schema documentation
- Produce analysis reports

### File Management
- Organize race data by year, location, and race type
- Validate JSON schema compliance
- Process and convert data formats
- Manage image assets and metadata

## Project Structure Understanding

Claude can help navigate and understand this triathlon result data repository which contains:

- **Race Results**: TSV files with participant times and rankings
- **Weather Data**: JSON files with race day weather conditions
- **Images**: Race location photos and promotional materials
- **Schemas**: JSON schemas for data validation
- **Configuration**: Package.json and other project setup files

## ファイルの役割

- `race-info.json` 大会情報のマスタ
- `images/` 大会を象徴する画像。webp形式。300x200以内に収まる大きさ。
- `master/<year>/<id>/result.tsv` 大会のリザルトデータ
- `master/<year>/<id>/weather-info.json` 大会の天気ータ

### GitHub Workflows (.github/workflows/)

The project includes automated CI/CD workflows for data validation:

- **json-check.yml**: Runs JSON syntax validation using pytest
  - Triggers on changes to JSON files, tests, workflows, or README
  - Uses Python 3.x and pytest for validation
  - Ensures all JSON files have valid syntax

- **validate-race-info.yml**: Validates race information data
  - Triggers on changes to `race-info.json` or `race-info-schema.json`
  - Uses Node.js 22 and ajv-cli for JSON Schema validation
  - Validates race-info.json against its schema

- **validate-weather-data.yml**: Validates weather data files
  - Triggers on changes to weather-data.json files or weather-schema.json
  - Uses Node.js 22 and ajv-cli for JSON Schema validation
  - Finds and validates all weather-data.json files in the master directory
  - Provides detailed validation results for each file

These workflows ensure data integrity and consistency across the repository.

## Getting Started with Claude

1. **Ask Specific Questions**: "Analyze the 2024 Miyakojima race results"
2. **Request Code**: "Write a script to validate all JSON files"
3. **Data Insights**: "What trends do you see in triathlon completion times?"
4. **Documentation**: "Create documentation for the race-info schema"

## Best Practices

- Provide clear, specific requests
- Share relevant file paths when asking about specific data
- Ask for explanations of complex analyses
- Request code comments for better understanding

## Contact and Support

Claude is available through various interfaces and can help with both technical and analytical aspects of this triathlon data project.

---

*This document serves as a guide for working with Claude AI on triathlon result data analysis and project management.*
