# AWS Lambda Module for MCP Server
#
# Deploys the MCP server as a Lambda function with API Gateway

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  function_name = var.function_name != "" ? var.function_name : var.api_name
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda" {
  name = "${local.function_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Secrets Manager secret
resource "aws_secretsmanager_secret" "this" {
  count                   = var.create_secret ? 1 : 0
  name                    = "${local.function_name}-secrets"
  description             = "Secrets for ${local.function_name}"
  recovery_window_in_days = var.secret_recovery_window
}

resource "aws_secretsmanager_secret_version" "this" {
  count    = var.create_secret ? 1 : 0
  secret_id = aws_secretsmanager_secret.this[0].id
  secret_string = jsonencode(var.secret_values)
}

# Lambda function
resource "aws_lambda_function" "this" {
  function_name = local.function_name
  role          = aws_iam_role.lambda.arn
  image_uri     = var.container_image
  package_type  = "Image"

  memory_size = var.memory_size
  timeout     = var.timeout
  ephemeral_storage {
    size = var.ephemeral_storage_size
  }

  environment {
    variables = var.environment_variables
  }

  tracing_config {
    mode = var.tracing_enabled ? "Active" : "Passive"
  }

  dynamic "vpc_config" {
    for_each = var.vpc_subnet_ids != [] ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }
}

# API Gateway
resource "aws_apigatewayv2_api" "this" {
  name          = var.api_name
  protocol_type = "HTTP"
  description   = var.api_description
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id             = aws_apigatewayv2_api.this.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.this.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = var.stage_name
  auto_deploy = true
}

# Lambda invoke permission for API Gateway
resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
